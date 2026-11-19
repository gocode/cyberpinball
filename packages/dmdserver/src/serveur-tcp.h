// Serveur réseau de cyberpinball-dmdserver : reçoit les images du front-end et de VPX (DMDServer = 1) et
// les passe à libdmdutil.
//
// Remplace DMDUtil::DMDServer de la DLL de VPX 10.8.1-5436 (libdmdutil 3485e2e, src/DMDServer.cpp), inutilisable
// sous Windows : ses sockets sont non bloquants, et il compare l'erreur de sockpp (WSAGetLastError : 10035,
// WSAEWOULDBLOCK) à EWOULDBLOCK (140 dans errno.h de MSVC). D'où, relevé avec la vraie DLL :
//   - le fil d'acceptation, qui devait dormir 100 ms quand personne n'arrive, tourne à vide et écrit
//     « Error accepting connection » sans arrêt (plus de 100 000 lignes en quelques secondes, un cœur occupé) ;
//   - chaque client est déconnecté dès que rien n'est encore arrivé sur sa connexion : aucune image ne
//     passe, ni du front-end ni de VPX.
// Même protocole (en-tête DMDStream de 25 octets, Paths + Update pour les modes Data et SerumCommand, RGB16,
// RGB24 ; le client le plus récent a l'afficheur ; disconnectOthers ; écran noirci au départ du client
// courant sans image gardée), même appels à libdmdutil (QueueUpdate, UpdateRGB16Data, UpdateRGB24Data),
// mais sockets bloquants : chaque fil attend ses octets sans tourner.

#pragma once

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "DMDUtil/DMD.h"

namespace serveur
{

constexpr int kMaxWidth = 256;  // DMDSERVER_MAX_WIDTH
constexpr int kMaxHeight = 64;  // DMDSERVER_MAX_HEIGHT

class TcpServer
{
 public:
  explicit TcpServer(DMDUtil::DMD* dmd) : m_dmd(dmd) {}
  ~TcpServer() { Stop(); }

  /** Écoute addr:port ; false (raison sur la sortie d'erreur) si l'adresse est invalide ou le port pris. */
  bool Start(const char* addr, int port)
  {
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
    {
      fprintf(stderr, "Serveur du DMD : Winsock indisponible.\n");
      return false;
    }
    m_wsa = true;
    addrinfo hints{};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;
    addrinfo* found = nullptr;
    std::string service = std::to_string(port);
    if (getaddrinfo(addr && *addr ? addr : "127.0.0.1", service.c_str(), &hints, &found) != 0 || !found)
    {
      fprintf(stderr, "Serveur du DMD : adresse %s invalide.\n", addr ? addr : "");
      return false;
    }
    SOCKET s = socket(found->ai_family, found->ai_socktype, found->ai_protocol);
    BOOL exclusive = TRUE;
    if (s != INVALID_SOCKET) setsockopt(s, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char*>(&exclusive), sizeof(exclusive));
    bool ok = s != INVALID_SOCKET && bind(s, found->ai_addr, static_cast<int>(found->ai_addrlen)) == 0 && listen(s, SOMAXCONN) == 0;
    freeaddrinfo(found);
    if (!ok)
    {
      fprintf(stderr, "Serveur du DMD : ecoute impossible sur %s:%d (erreur %d).\n", addr ? addr : "", port, WSAGetLastError());
      if (s != INVALID_SOCKET) closesocket(s);
      return false;
    }
    m_listener = s;
    m_running = true;
    m_accept = std::thread([this]() { AcceptLoop(); });
    return true;
  }

  bool IsRunning() const { return m_running.load(); }

  /** Ferme l'écoute et toutes les connexions, puis attend la fin de leurs fils. */
  void Stop()
  {
    if (m_running.exchange(false))
    {
      closesocket(m_listener);
      m_listener = INVALID_SOCKET;
    }
    if (m_accept.joinable()) m_accept.join();
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      for (auto& c : m_clients) shutdown(c.second, SD_BOTH);
      m_done.wait(lock, [this]() { return m_threads == 0; });
    }
    if (m_wsa)
    {
      WSACleanup();
      m_wsa = false;
    }
  }

 private:
  void AcceptLoop()
  {
    uint32_t next = 0;
    while (m_running.load())
    {
      SOCKET client = accept(m_listener, nullptr, nullptr);
      if (client == INVALID_SOCKET)
      {
        if (!m_running.load()) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        continue;
      }
      BOOL noDelay = TRUE;
      setsockopt(client, IPPROTO_TCP, TCP_NODELAY, reinterpret_cast<const char*>(&noDelay), sizeof(noDelay));
      uint32_t id = ++next;
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_clients.emplace_back(id, client);
        m_current = id;  // le client le plus récent a l'afficheur
        m_threads++;
      }
      std::thread([this, client, id]() { Client(client, id); }).detach();
    }
  }

  /** len octets, ou false (connexion fermée, erreur). */
  static bool ReadAll(SOCKET s, void* buffer, int len)
  {
    char* p = static_cast<char*>(buffer);
    while (len > 0)
    {
      int n = recv(s, p, len, 0);
      if (n <= 0) return false;
      p += n;
      len -= n;
    }
    return true;
  }

  bool IsCurrent(uint32_t id)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return id == m_current;
  }

  void Client(SOCKET s, uint32_t id)
  {
    fprintf(stderr, "Serveur du DMD : client %u connecte.\n", id);
    fflush(stderr);
    std::vector<uint8_t> buffer(std::max<size_t>(sizeof(DMDUtil::DMD::Update), kMaxWidth * kMaxHeight * 3));
    DMDUtil::DMD::StreamHeader header;
    bool buffered = false;
    bool blockedLogged = false;
    while (m_running.load())
    {
      if (!ReadAll(s, &header, sizeof(header))) break;
      header.convertToHostByteOrder();
      if (strncmp(header.header, "DMDStream", sizeof(header.header)) != 0 || header.version != 1) continue;
      buffered = header.buffered == 1;
      const bool current = IsCurrent(id);
      if (current && header.disconnectOthers) DisconnectOthers(id);
      if (!current && !blockedLogged)
      {
        fprintf(stderr, "Serveur du DMD : client %u en attente, un client plus recent a l'afficheur.\n", id);
        fflush(stderr);
        blockedLogged = true;
      }
      if (current) blockedLogged = false;
      bool ok = true;
      switch (header.mode)
      {
        case DMDUtil::DMD::Mode::Data:
        case DMDUtil::DMD::Mode::SerumCommand:
        {
          DMDUtil::DMD::PathsHeader paths;
          if (!ReadAll(s, &paths, sizeof(paths)) || !ReadAll(s, buffer.data(), sizeof(DMDUtil::DMD::Update)))
          {
            ok = false;
            break;
          }
          if (!current || strncmp(paths.header, "Paths", sizeof(paths.header)) != 0) break;
          auto update = std::make_shared<DMDUtil::DMD::Update>();
          memcpy(update.get(), buffer.data(), sizeof(DMDUtil::DMD::Update));
          update->convertToHostByteOrder();
          if (update->width > kMaxWidth || update->height > kMaxHeight) break;
          paths.name[sizeof(paths.name) - 1] = 0;
          m_dmd->SetRomName(paths.name);
          m_dmd->QueueUpdate(update, buffered);
          break;
        }
        case DMDUtil::DMD::Mode::RGB16:
        case DMDUtil::DMD::Mode::RGB24:
        {
          const bool rgb24 = header.mode == DMDUtil::DMD::Mode::RGB24;
          const size_t expected = static_cast<size_t>(header.width) * header.height * (rgb24 ? 3 : 2);
          if (header.length > buffer.size() || header.width > kMaxWidth || header.height > kMaxHeight)
          {
            // Paquet impossible : la suite du flux ne se lit plus, la connexion est fermée.
            fprintf(stderr, "Serveur du DMD : client %u, image refusee (%ux%u, %u octets).\n", id, header.width, header.height, header.length);
            ok = false;
            break;
          }
          if (!ReadAll(s, buffer.data(), static_cast<int>(header.length)))
          {
            ok = false;
            break;
          }
          if (!current || header.length != expected) break;
          if (rgb24)
            m_dmd->UpdateRGB24Data(buffer.data(), header.width, header.height, buffered);
          else
          {
            uint16_t* pixels = reinterpret_cast<uint16_t*>(buffer.data());
            for (size_t i = 0; i < header.length / 2; i++) pixels[i] = ntohs(pixels[i]);
            m_dmd->UpdateRGB16Data(pixels, header.width, header.height, buffered);
          }
          break;
        }
        default:
          break;  // les autres modes ne passent pas par le réseau (comme DMDServer)
      }
      if (!ok) break;
    }

    std::lock_guard<std::mutex> lock(m_mutex);
    // Le client courant s'en va sans image gardée : écran noirci, comme DMDServer.
    if (id == m_current && !buffered && !m_dmd->QueueBuffer())
    {
      m_dmd->SetRomName("");
      std::vector<uint8_t> black(128 * 32 * 3, 0);
      m_dmd->UpdateRGB24Data(black.data(), 128, 32, true);
    }
    m_clients.erase(std::remove_if(m_clients.begin(), m_clients.end(), [id](const auto& c) { return c.first == id; }), m_clients.end());
    if (id == m_current) m_current = m_clients.empty() ? 0 : m_clients.back().first;
    closesocket(s);
    fprintf(stderr, "Serveur du DMD : client %u parti.\n", id);
    fflush(stderr);
    if (--m_threads == 0) m_done.notify_all();
  }

  /** Le client courant demande l'afficheur pour lui seul (VPX au début d'une partie) : les autres sont fermés. */
  void DisconnectOthers(uint32_t id)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    for (auto& c : m_clients)
      if (c.first != id) shutdown(c.second, SD_BOTH);
  }

  DMDUtil::DMD* m_dmd;
  bool m_wsa = false;
  SOCKET m_listener = INVALID_SOCKET;
  std::atomic<bool> m_running{false};
  std::thread m_accept;
  std::mutex m_mutex;
  std::condition_variable m_done;
  std::vector<std::pair<uint32_t, SOCKET>> m_clients;
  uint32_t m_current = 0;
  int m_threads = 0;
};

}  // namespace serveur
