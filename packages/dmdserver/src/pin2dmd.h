// Sortie PIN2DMD de cyberpinball-dmdserver.
//
// Pourquoi : le dmdutil64.dll de VPX 10.8.1-5436 (libdmdutil 3485e2e) ne sait pas piloter un PIN2DMD. Tout son
// code PIN2DMD est sous « #if defined(DMDUTIL_ENABLE_PIN2DMD) » (DMD.cpp : FindDisplays, HasDisplay,
// PIN2DMDThread), et le CMakeLists.txt de ce commit ne définit jamais cette macro (seulement
// DMDUTIL_ENABLE_VNI). Le désassemblage de la DLL ne montre aucun appel à ses fonctions libusb : la carte reste
// noire en partie comme dans le front-end, quel que soit [Plugin.DMDUtil] PIN2DMD. Corrigé en amont depuis
// (libdmdutil f924569, option ENABLE_PIN2DMD), pas encore dans une version publiée de VPX.
//
// Le serveur pilote donc la carte lui-même quand la DLL ne le fait pas (src/empreintes.h, colonne pin2dmd) :
//   - avec la libusb de VPX (libusb64-1.0.dll de plugins\dmdutil), chargée à la demande ;
//   - en ouvrant la carte comme PIN2DMDInit (0314:E457, nom de produit, interface 0, noms « PIN2DMD »,
//     « PIN2DMD XL », « PIN2DMD HD »), mais en relâchant tout à chaque échec, dit dans le journal avec le
//     code de libusb ;
//   - branchée comme un RGB24DMD de libdmdutil (Output, DMD::AddRGB24DMD) : libdmdutil appelle Update
//     (virtuelle) à chaque image, en RGB24, qu'elle vienne du front-end ou de VPX (DMDServer = 1),
//     colorisation comprise ; l'envoi USB se fait sur un fil à part.
//
// Format des images envoyées à la carte (l'interface du firmware PIN2DMD, la même que celle des autres
// front-ends, et non le mode « RAW » 52 80 20 de PIN2DMDRenderRaw, que rien ne garantit sur tous les
// firmwares ; borne d'un joueur : PIN2DMD COLORPRISM V4.53 sur Nucleo-F429ZI) :
//   - un paquet = 4 octets d'en-tête 81 C3 E9 00, puis 6 plans de L = largeur × hauteur / 2 octets chacun,
//     envoyés en un seul transfert « bulk » sur le point de sortie 0x01 ;
//   - chaque couleur est ramenée à 6 bits (0 à 63) ; le plan n porte le bit n de chaque couleur ;
//   - l'afficheur est vu en deux moitiés : le point p de la moitié haute (lignes du haut, de gauche à droite)
//     va avec le point p de la moitié basse ; l'octet p d'un plan porte les trois couleurs du point haut aux
//     bits 0, 1, 2 et celles du point bas aux bits 3, 4, 5 ;
//   - quelle couleur va au bit 0, 1, 2 dépend des dalles : réglage « rgbseq » de la carte (0 : rouge, vert,
//     bleu ; 1 : rouge, bleu, vert ; 2 : vert, rouge, bleu ; 3 : vert, bleu, rouge ; 4 : bleu, rouge, vert ;
//     5 : bleu, vert, rouge ; toute autre valeur : comme 0) ;
//   - PIN2DMD HD (256 × 64) : les octets sont ensuite remis dans l'ordre de ses modules, selon son réglage
//     « buffermode » (OrderForHd) ;
//   - commandes : 2052 octets commençant par 81 C3 E7 FF <code> ; 10 demande la configuration, que la carte
//     rend en 64 octets sur le point d'entrée 0x81 (octet 26 : buffermode, octet 30 : rgbseq) ; 07 remet la
//     carte à zéro (envoyée en la quittant).
// La courbe qui ramène 8 bits à 6 est la nôtre : arrondi de 63 × (v / 255)^2,5.

#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <type_traits>
#include <vector>

#include "DMDUtil/RGB24DMD.h"

namespace pin2dmd
{

constexpr uint16_t kVid = 0x0314;
constexpr uint16_t kPid = 0xe457;
constexpr unsigned char kEpOut = 0x01;
constexpr unsigned char kEpIn = 0x81;
constexpr int kLibusbErrorNoDevice = -4;

// ---------------------------------------------------------------------------------------------------------
// Images : RGB24 vers le paquet de la carte (format décrit en tête de fichier).

/** 8 bits vers 6 : arrondi de 63 × (v / 255)^2,5 (le noir reste noir, le blanc donne 63). */
inline const uint8_t* SixBits()
{
  static const struct Table
  {
    uint8_t v[256];
    Table()
    {
      for (int i = 0; i < 256; i++) v[i] = static_cast<uint8_t>(std::lround(63.0 * std::pow(i / 255.0, 2.5)));
    }
  } table;
  return table.v;
}

/** Pour chaque réglage rgbseq : la couleur de l'image (0 rouge, 1 vert, 2 bleu) mise au bit 0, 1 et 2. */
constexpr uint8_t kColorOrder[6][3] = {{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0}};

/** Les 6 plans d'une image RGB24 de width × height ; out : 6 × (width × height / 2) octets. */
inline void EncodePlanes(const uint8_t* rgb, int width, int height, int rgbseq, uint8_t* out)
{
  const uint8_t* six = SixBits();
  const int setting = rgbseq & 0x0F;
  const uint8_t* order = kColorOrder[setting <= 5 ? setting : 0];
  const int half = width * height / 2;
  for (int n = 0; n < 6; n++)
  {
    uint8_t* plane = out + static_cast<size_t>(n) * half;
    for (int p = 0; p < half; p++)
    {
      const uint8_t* top = rgb + static_cast<size_t>(p) * 3;
      const uint8_t* bottom = rgb + static_cast<size_t>(p + half) * 3;
      uint8_t byte = 0;
      for (int bit = 0; bit < 3; bit++)
      {
        byte |= static_cast<uint8_t>(((six[top[order[bit]]] >> n) & 1) << bit);
        byte |= static_cast<uint8_t>(((six[bottom[order[bit]]] >> n) & 1) << (bit + 3));
      }
      plane[p] = byte;
    }
  }
}

/**
 * PIN2DMD HD : les plans (EncodePlanes, lignes de width octets) remis dans l'ordre de ses modules.
 * buffermode 0 : chaque ligne de chaque plan donne, pour chaque colonne c de sa moitié gauche, l'octet de la
 * colonne c + width / 2, puis celui de la colonne c décalé d'un bit vers la gauche.
 * Autre buffermode : pour chaque ligne, chaque sortie (16) de chaque circuit de pilotage (width / 32), la
 * colonne c = circuit × 16 + sortie, et pour chaque plan du 6e au 1er, les deux mêmes octets.
 */
inline void OrderForHd(const uint8_t* planes, int width, int height, int buffermode, uint8_t* out)
{
  const int half = width * height / 2;
  const int rows = height / 2;
  if (buffermode == 0)
  {
    for (int line = 0; line < 6 * rows; line++)
    {
      const uint8_t* in = planes + static_cast<size_t>(line) * width;
      uint8_t* o = out + static_cast<size_t>(line) * width;
      for (int c = 0; c < width / 2; c++)
      {
        o[2 * c] = in[c + width / 2];
        o[2 * c + 1] = static_cast<uint8_t>(in[c] << 1);
      }
    }
    return;
  }
  uint8_t* o = out;
  for (int row = 0; row < rows; row++)
    for (int output = 0; output < 16; output++)
      for (int driver = 0; driver < width / 32; driver++)
      {
        const int col = driver * 16 + output;
        for (int n = 5; n >= 0; n--)
        {
          const uint8_t* line = planes + static_cast<size_t>(n) * half + static_cast<size_t>(row) * width;
          *o++ = line[col + width / 2];
          *o++ = static_cast<uint8_t>(line[col] << 1);
        }
      }
}

/**
 * Met une image RGB24 de w × h à la taille de l'afficheur (tw × th) : copie si la taille est la même, sinon
 * réduite ou agrandie (moyenne des points couverts) en gardant ses proportions, centrée sur fond noir
 * (128 × 16 se retrouve ainsi centré dans 128 × 32).
 */
inline void Fit(const uint8_t* src, int w, int h, uint8_t* dst, int tw, int th)
{
  if (w == tw && h == th)
  {
    memcpy(dst, src, static_cast<size_t>(tw) * th * 3);
    return;
  }
  memset(dst, 0, static_cast<size_t>(tw) * th * 3);
  if (w <= 0 || h <= 0) return;
  // Échelle commune (proportions gardées) : la plus grande qui tient.
  double scale = std::min(static_cast<double>(tw) / w, static_cast<double>(th) / h);
  int ow = std::min(tw, std::max(1, static_cast<int>(w * scale + 0.5)));
  int oh = std::min(th, std::max(1, static_cast<int>(h * scale + 0.5)));
  int ox = (tw - ow) / 2, oy = (th - oh) / 2;
  for (int y = 0; y < oh; y++)
  {
    int y0 = y * h / oh, y1 = std::max(y0 + 1, (y + 1) * h / oh);
    for (int x = 0; x < ow; x++)
    {
      int x0 = x * w / ow, x1 = std::max(x0 + 1, (x + 1) * w / ow);
      unsigned sum[3] = {0, 0, 0}, n = 0;
      for (int sy = y0; sy < y1; sy++)
        for (int sx = x0; sx < x1; sx++)
        {
          const uint8_t* p = src + (static_cast<size_t>(sy) * w + sx) * 3;
          sum[0] += p[0];
          sum[1] += p[1];
          sum[2] += p[2];
          n++;
        }
      uint8_t* q = dst + (static_cast<size_t>(y + oy) * tw + x + ox) * 3;
      for (int c = 0; c < 3; c++) q[c] = static_cast<uint8_t>(sum[c] / n);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// libusb : celle de VPX, liée à la demande (libusb.h n'est pas dans le dépôt).

struct Context;
struct Device;
struct Handle;

struct DeviceDescriptor
{
  uint8_t bLength;
  uint8_t bDescriptorType;
  uint16_t bcdUSB;
  uint8_t bDeviceClass;
  uint8_t bDeviceSubClass;
  uint8_t bDeviceProtocol;
  uint8_t bMaxPacketSize0;
  uint16_t idVendor;
  uint16_t idProduct;
  uint16_t bcdDevice;
  uint8_t iManufacturer;
  uint8_t iProduct;
  uint8_t iSerialNumber;
  uint8_t bNumConfigurations;
};

struct Libusb
{
  int(WINAPI* init)(Context**) = nullptr;
  void(WINAPI* exit)(Context*) = nullptr;
  intptr_t(WINAPI* getDeviceList)(Context*, Device***) = nullptr;
  void(WINAPI* freeDeviceList)(Device**, int) = nullptr;
  int(WINAPI* getDeviceDescriptor)(Device*, DeviceDescriptor*) = nullptr;
  int(WINAPI* open)(Device*, Handle**) = nullptr;
  void(WINAPI* close)(Handle*) = nullptr;
  int(WINAPI* claimInterface)(Handle*, int) = nullptr;
  int(WINAPI* releaseInterface)(Handle*, int) = nullptr;
  int(WINAPI* getStringDescriptorAscii)(Handle*, uint8_t, unsigned char*, int) = nullptr;
  int(WINAPI* bulkTransfer)(Handle*, unsigned char, unsigned char*, int, int*, unsigned int) = nullptr;

  /** Charge libusb64-1.0.dll de ce dossier (celle de VPX) ; false, raison écrite sur la sortie d'erreur. */
  bool Load(const std::wstring& dir)
  {
    std::wstring dll = dir + L"\\libusb64-1.0.dll";
    HMODULE module = LoadLibraryExW(dll.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!module)
    {
      fprintf(stderr, "PIN2DMD : libusb64-1.0.dll de VPX impossible a charger (erreur %lu).\n", GetLastError());
      return false;
    }
    bool ok = true;
    auto bind = [&](auto& fn, const char* name)
    {
      fn = reinterpret_cast<std::remove_reference_t<decltype(fn)>>(GetProcAddress(module, name));
      if (!fn)
      {
        fprintf(stderr, "PIN2DMD : libusb64-1.0.dll sans %s.\n", name);
        ok = false;
      }
    };
    bind(init, "libusb_init");
    bind(exit, "libusb_exit");
    bind(getDeviceList, "libusb_get_device_list");
    bind(freeDeviceList, "libusb_free_device_list");
    bind(getDeviceDescriptor, "libusb_get_device_descriptor");
    bind(open, "libusb_open");
    bind(close, "libusb_close");
    bind(claimInterface, "libusb_claim_interface");
    bind(releaseInterface, "libusb_release_interface");
    bind(getStringDescriptorAscii, "libusb_get_string_descriptor_ascii");
    bind(bulkTransfer, "libusb_bulk_transfer");
    return ok;
  }
};

// ---------------------------------------------------------------------------------------------------------
// La carte.

/** Taille de l'afficheur d'après le nom que donne la carte ; false : nom inconnu. */
inline bool SizeOf(const std::string& product, uint16_t& width, uint16_t& height)
{
  if (product == "PIN2DMD") width = 128, height = 32;
  else if (product == "PIN2DMD XL") width = 192, height = 64;
  else if (product == "PIN2DMD HD") width = 256, height = 64;
  else return false;
  return true;
}

/** Une carte ouverte et réservée. */
struct Card
{
  Context* ctx = nullptr;
  Handle* handle = nullptr;
  std::string product;
  uint16_t width = 0;
  uint16_t height = 0;
  int rgbseq = 0;       // ordre des couleurs des dalles
  int buffermode = 0;   // ordre des modules (HD)
  bool config = false;  // configuration lue
};

/** Commande de la carte : 2052 octets, 81 C3 E7 FF <code>, sur le point de sortie. */
inline int Command(const Libusb& usb, Handle* handle, uint8_t code)
{
  std::vector<unsigned char> command(2052, 0);
  const unsigned char start[] = {0x81, 0xC3, 0xE7, 0xFF, code};
  memcpy(command.data(), start, sizeof(start));
  int transferred = 0;
  return usb.bulkTransfer(handle, kEpOut, command.data(), static_cast<int>(command.size()), &transferred, 2000);
}

/** Lit la configuration de la carte (commande 10) : ordre des couleurs et des modules. Sans réponse : défauts. */
inline void ReadConfig(const Libusb& usb, Card& card)
{
  if (Command(usb, card.handle, 0x10) != 0) return;
  unsigned char reply[64] = {};
  int got = 0;
  if (usb.bulkTransfer(card.handle, kEpIn, reply, static_cast<int>(sizeof(reply)), &got, 2000) != 0 || got <= 30) return;
  card.buffermode = reply[26];
  card.rgbseq = reply[30];
  card.config = true;
}

inline std::string Say(const char* format, ...)
{
  char buffer[512];
  va_list args;
  va_start(args, format);
  vsnprintf(buffer, sizeof(buffer), format, args);
  va_end(args);
  return buffer;
}

/**
 * Ouvre le premier PIN2DMD branché ; false sans carte utilisable (why dit pourquoi, avec le code de libusb),
 * et rien n'est gardé : une nouvelle tentative, une seconde plus tard, part de zéro.
 */
inline bool OpenCard(const Libusb& usb, Card& card, std::string& why)
{
  Context* ctx = nullptr;
  int rc = usb.init(&ctx);
  if (rc < 0)
  {
    why = Say("PIN2DMD : libusb_init en echec (code %d).", rc);
    return false;
  }
  Device** list = nullptr;
  intptr_t count = usb.getDeviceList(ctx, &list);
  if (count < 0)
  {
    why = Say("PIN2DMD : liste des peripheriques USB illisible (code %d).", static_cast<int>(count));
    usb.exit(ctx);
    return false;
  }
  Device* found = nullptr;
  DeviceDescriptor desc{};
  for (intptr_t i = 0; i < count && !found; i++)
  {
    DeviceDescriptor d{};
    if (usb.getDeviceDescriptor(list[i], &d) < 0 || d.idVendor != kVid || d.idProduct != kPid) continue;
    found = list[i];
    desc = d;
  }
  if (!found)
  {
    usb.freeDeviceList(list, 1);
    usb.exit(ctx);
    why = "PIN2DMD : aucune carte 0314:E457 vue par libusb.";
    return false;
  }
  Handle* handle = nullptr;
  rc = usb.open(found, &handle);
  usb.freeDeviceList(list, 1);
  if (rc < 0 || !handle)
  {
    why = Say("PIN2DMD : ouverture refusee par libusb (code %d).", rc);
    usb.exit(ctx);
    return false;
  }
  unsigned char name[256] = {};
  int length = usb.getStringDescriptorAscii(handle, desc.iProduct, name, static_cast<int>(sizeof(name) - 1));
  std::string product = length > 0 ? std::string(reinterpret_cast<const char*>(name), strnlen(reinterpret_cast<const char*>(name), length)) : std::string();
  rc = usb.claimInterface(handle, 0);
  if (rc < 0)
  {
    why = Say("PIN2DMD : interface 0 deja prise ou refusee (code %d).", rc);
    usb.close(handle);
    usb.exit(ctx);
    return false;
  }
  uint16_t width = 0, height = 0;
  if (!SizeOf(product, width, height))
  {
    why = length <= 0 ? Say("PIN2DMD : nom de la carte illisible (code %d).", length)
                      : Say("PIN2DMD : nom de carte inconnu \"%s\".", product.c_str());
    usb.releaseInterface(handle, 0);
    usb.close(handle);
    usb.exit(ctx);
    return false;
  }
  card.ctx = ctx;
  card.handle = handle;
  card.product = product;
  card.width = width;
  card.height = height;
  ReadConfig(usb, card);
  if (card.config)
    fprintf(stderr, "PIN2DMD : carte \"%s\" ouverte (%ux%u, ordre des couleurs %d), pilotee par le serveur du DMD.\n", product.c_str(), width, height, card.rgbseq);
  else
    fprintf(stderr, "PIN2DMD : carte \"%s\" ouverte (%ux%u, configuration illisible : ordre des couleurs par defaut), pilotee par le serveur du DMD.\n", product.c_str(), width, height);
  fflush(stderr);
  return true;
}

/** Remet la carte à zéro, la relâche et ferme libusb. */
inline void CloseCard(const Libusb& usb, Card& card)
{
  if (card.handle)
  {
    Command(usb, card.handle, 0x07);
    usb.releaseInterface(card.handle, 0);
    usb.close(card.handle);
  }
  if (card.ctx) usb.exit(card.ctx);
  card = Card{};
}

// ---------------------------------------------------------------------------------------------------------
// L'afficheur, vu par libdmdutil comme un RGB24DMD : chaque image lui arrive par Update.

class Output : public DMDUtil::RGB24DMD
{
 public:
  /** testFile : essai sans carte (--pin2dmd-essai) ; chaque paquet s'ajoute à ce fichier au lieu de partir en USB. */
  Output(const Libusb& usb, const Card& card, std::string testFile = {})
      : DMDUtil::RGB24DMD(card.width, card.height), m_usb(usb), m_card(card), m_testFile(std::move(testFile))
  {
    const size_t pixels = static_cast<size_t>(card.width) * card.height;
    m_latest.resize(pixels * 3);
    m_shown.resize(pixels * 3);
    m_packet.resize(4 + pixels * 3);  // 6 plans de pixels / 2 octets
    m_sender = std::thread([this]() { SendLoop(); });
  }

  ~Output() override
  {
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_stop = true;
    }
    m_wake.notify_all();
    if (m_sender.joinable()) m_sender.join();
    CloseCard(m_usb, m_card);
  }

  void Update(uint8_t* pRGB24Data, uint16_t width = 0, uint16_t height = 0) override
  {
    if (!pRGB24Data) return;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      Fit(pRGB24Data, width ? width : m_card.width, height ? height : m_card.height, m_latest.data(), m_card.width, m_card.height);
      m_fresh = true;
    }
    m_wake.notify_one();
  }

  /** La carte ne répond plus (débranchée) : le serveur s'arrête, Cyber Pinball le relance et la recherche reprend. */
  bool Lost() const { return m_lost.load(); }

 private:
  /** Envoie la dernière image reçue, quand elle diffère de celle qui est à l'écran. */
  void SendLoop()
  {
    const unsigned char header[] = {0x81, 0xC3, 0xE9, 0x00};
    memcpy(m_packet.data(), header, sizeof(header));
    const bool hd = m_card.width == 256;
    std::vector<uint8_t> planes(hd ? m_packet.size() - 4 : 0);
    bool anything = false;
    int failures = 0;
    for (;;)
    {
      {
        std::unique_lock<std::mutex> lock(m_mutex);
        m_wake.wait(lock, [this]() { return m_stop || m_fresh; });
        if (m_stop) return;
        m_fresh = false;
        if (anything && m_latest == m_shown) continue;
        m_shown = m_latest;
      }
      if (hd)
      {
        EncodePlanes(m_shown.data(), m_card.width, m_card.height, m_card.rgbseq, planes.data());
        OrderForHd(planes.data(), m_card.width, m_card.height, m_card.buffermode, m_packet.data() + 4);
      }
      else
        EncodePlanes(m_shown.data(), m_card.width, m_card.height, m_card.rgbseq, m_packet.data() + 4);
      const int rc = Transfer();
      if (rc == 0)
      {
        if (!anything)
        {
          fprintf(stderr, "PIN2DMD : premiere image envoyee.\n");
          fflush(stderr);
        }
        anything = true;
        failures = 0;
        continue;
      }
      anything = true;
      if (rc == kLibusbErrorNoDevice || ++failures >= 5)
      {
        fprintf(stderr, "PIN2DMD : envoi en echec (code %d), carte perdue.\n", rc);
        fflush(stderr);
        m_lost = true;
        return;
      }
    }
  }

  /** Le paquet vers la carte, ou ajouté au fichier d'essai (le lecteur n'y compte que les paquets complets). */
  int Transfer()
  {
    if (m_testFile.empty())
    {
      int transferred = 0;
      return m_usb.bulkTransfer(m_card.handle, kEpOut, m_packet.data(), static_cast<int>(m_packet.size()), &transferred, 1000);
    }
    FILE* f = fopen(m_testFile.c_str(), "ab");
    if (!f) return -1;
    const size_t written = fwrite(m_packet.data(), 1, m_packet.size(), f);
    fclose(f);
    return written == m_packet.size() ? 0 : -1;
  }

  const Libusb& m_usb;
  Card m_card;
  std::string m_testFile;
  std::vector<uint8_t> m_latest;  // dernière image reçue, à la taille de l'afficheur
  std::vector<uint8_t> m_shown;   // dernière image envoyée
  std::vector<unsigned char> m_packet;
  std::mutex m_mutex;
  std::condition_variable m_wake;
  bool m_fresh = false;
  bool m_stop = false;
  std::atomic<bool> m_lost{false};
  std::thread m_sender;
};

}  // namespace pin2dmd
