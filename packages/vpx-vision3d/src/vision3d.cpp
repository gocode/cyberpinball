// license:GPLv3+
//
// Plugin VPX « Vision3D » de Cyber Pinball : suivi de la tête.
//
// Reçoit la position de la tête par UDP (format d'opentrack, voir vue.h) et
// déplace le point de vue de VPX à chaque image. En mode Window (borne), la
// perspective est celle d'une vraie fenêtre ouverte sur la table : l'écran
// reste le cadre, le décor se déplace avec les yeux du joueur.
//
// Le plugin reste inerte tant qu'aucune position n'arrive : aucun coût pour une partie sans
// suivi de la tête. Au premier paquet, il coupe le pré-rendu statique (le décor doit suivre la
// tête) ; en fin de partie, il le rétablit et rend la vue d'origine.
//
// Réglages (VPinballX.ini, section [Plugin.Vision3D]) :
//   Enable = 1    charge le plugin (écrit par Cyber Pinball)
//   Port   = 4242 port UDP local écouté
//   Gain   = 1    amplification du mouvement (1 = réel)

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>

#include <atomic>
#include <chrono>
#include <mutex>
#include <thread>

#include "MsgPlugin.h"
#include "VPXPlugin.h"
#include "vue.h"

using namespace vision3d;

namespace {

const MsgPluginAPI* msgApi = nullptr;
VPXPluginAPI* vpxApi = nullptr;
uint32_t endpointId = 0;
unsigned int getVpxApiId = 0, onGameStartId = 0, onGameEndId = 0, onPrepareFrameId = 0;

MSGPI_INT_VAL_SETTING(reglagePort, "Port", "UDP port", "Local UDP port receiving the head position (opentrack format)", true, 1024, 65535, 4242);
MSGPI_FLOAT_VAL_SETTING(reglageGain, "Gain", "Gain", "Head movement amplification (1 = real movement)", true, 0.1f, 4.f, 0.05f, 1.f);

using Horloge = std::chrono::steady_clock;

// Dernier déplacement reçu, partagé entre le fil de réception et le rendu.
std::mutex verrou;
Vec3 dernierDeplacement{ 0.f, 0.f, 0.f };
Horloge::time_point dernierPaquet{};
bool paquetRecu = false;

std::atomic<bool> arret{ false };
std::thread filReception;
SOCKET prise = INVALID_SOCKET;

bool enPartie = false;
VueDeBase base{};
VPXViewSetupDef vueVpx{};
Vec3 derniereVue{ 0.f, 0.f, 0.f };
bool preRenduCoupe = false;

void recevoir()
{
   unsigned char tampon[256];
   while (!arret.load())
   {
      const int n = recv(prise, reinterpret_cast<char*>(tampon), sizeof(tampon), 0);
      if (n <= 0)
         continue; // délai dépassé (SO_RCVTIMEO) ou erreur passagère : on revérifie l'arrêt
      Vec3 d;
      if (!lirePaquet(tampon, n, d))
         continue;
      std::lock_guard<std::mutex> l(verrou);
      dernierDeplacement = d;
      dernierPaquet = Horloge::now();
      paquetRecu = true;
   }
}

bool ouvrirPrise()
{
   WSADATA wsa;
   if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
      return false;
   prise = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
   if (prise == INVALID_SOCKET)
      return false;
   DWORD delai = 100; // ms : le fil revérifie la demande d'arrêt à ce rythme
   setsockopt(prise, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&delai), sizeof(delai));
   sockaddr_in adresse{};
   adresse.sin_family = AF_INET;
   adresse.sin_port = htons((u_short)reglagePort_Val);
   adresse.sin_addr.s_addr = htonl(INADDR_LOOPBACK); // local seulement : rien n'écoute le réseau
   if (bind(prise, reinterpret_cast<sockaddr*>(&adresse), sizeof(adresse)) != 0)
   {
      closesocket(prise);
      prise = INVALID_SOCKET;
      return false;
   }
   return true;
}

void fermerPrise()
{
   arret.store(true);
   if (filReception.joinable())
      filReception.join();
   if (prise != INVALID_SOCKET)
   {
      closesocket(prise);
      prise = INVALID_SOCKET;
      WSACleanup();
   }
   arret.store(false);
}

void MSGPIAPI onGameStart(const unsigned int, void*, void*)
{
   if (!vpxApi)
      return;
   VPXTableInfo table{};
   vpxApi->GetTableInfo(&table);
   vpxApi->GetActiveViewSetup(&vueVpx);
   base.mode = vueVpx.viewMode;
   base.vue = Vec3{ vueVpx.viewX, vueVpx.viewY, vueVpx.viewZ };
   base.hauteurTable = table.tableHeight;
   base.vitreHaut = vueVpx.windowTopZOfs;
   base.vitreBas = vueVpx.windowBottomZOfs;
   base.inclinaisonEcran = vueVpx.screenInclination;
   derniereVue = base.vue;
   preRenduCoupe = false;
   {
      std::lock_guard<std::mutex> l(verrou);
      paquetRecu = false;
      dernierDeplacement = Vec3{ 0.f, 0.f, 0.f };
   }
   // Port occupé (un autre logiciel l'écoute) : le plugin reste inerte pour cette partie.
   if (ouvrirPrise())
      filReception = std::thread(recevoir);
   enPartie = true;
}

void MSGPIAPI onPrepareFrame(const unsigned int, void*, void*)
{
   if (!enPartie || !vpxApi)
      return;
   Vec3 d;
   double silence;
   bool recu;
   {
      std::lock_guard<std::mutex> l(verrou);
      d = dernierDeplacement;
      recu = paquetRecu;
      silence = std::chrono::duration<double>(Horloge::now() - dernierPaquet).count();
   }
   if (!recu)
      return; // aucun capteur : la partie se joue comme d'habitude
   if (!preRenduCoupe)
   {
      // Le décor statique est pré-rendu une fois pour toutes ; il doit maintenant suivre la tête.
      vpxApi->DisableStaticPrerendering(1);
      preRenduCoupe = true;
   }
   const float f = attenuationSilence(silence);
   const Vec3 v = vuePourDeplacement(base, Vec3{ d.x * f, d.y * f, d.z * f }, reglageGain_Val);
   // Rien à refaire si la vue n'a pas bougé (moins d'un dixième d'unité VPX).
   if (std::fabs(v.x - derniereVue.x) < 0.1f && std::fabs(v.y - derniereVue.y) < 0.1f && std::fabs(v.z - derniereVue.z) < 0.1f)
      return;
   derniereVue = v;
   vueVpx.viewX = v.x;
   vueVpx.viewY = v.y;
   vueVpx.viewZ = v.z;
   vpxApi->SetActiveViewSetup(&vueVpx);
}

void MSGPIAPI onGameEnd(const unsigned int, void*, void*)
{
   if (!enPartie)
      return;
   enPartie = false;
   fermerPrise();
   if (vpxApi)
   {
      // La vue de la table retrouve sa position d'origine.
      vueVpx.viewX = base.vue.x;
      vueVpx.viewY = base.vue.y;
      vueVpx.viewZ = base.vue.z;
      vpxApi->SetActiveViewSetup(&vueVpx);
      if (preRenduCoupe)
         vpxApi->DisableStaticPrerendering(0);
      preRenduCoupe = false;
   }
}

} // namespace

MSGPI_EXPORT void MSGPIAPI Vision3DPluginLoad(const uint32_t sessionId, const MsgPluginAPI* api)
{
   msgApi = api;
   endpointId = sessionId;
   msgApi->RegisterSetting(endpointId, &reglagePort);
   msgApi->RegisterSetting(endpointId, &reglageGain);
   msgApi->BroadcastMsg(endpointId, getVpxApiId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_API), &vpxApi);
   msgApi->SubscribeMsg(endpointId, onGameStartId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_START), onGameStart, nullptr);
   msgApi->SubscribeMsg(endpointId, onGameEndId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_GAME_END), onGameEnd, nullptr);
   msgApi->SubscribeMsg(endpointId, onPrepareFrameId = msgApi->GetMsgID(VPXPI_NAMESPACE, VPXPI_EVT_ON_PREPARE_FRAME), onPrepareFrame, nullptr);
}

MSGPI_EXPORT void MSGPIAPI Vision3DPluginUnload()
{
   if (enPartie)
      onGameEnd(0, nullptr, nullptr);
   msgApi->UnsubscribeMsg(onGameStartId, onGameStart, nullptr);
   msgApi->UnsubscribeMsg(onGameEndId, onGameEnd, nullptr);
   msgApi->UnsubscribeMsg(onPrepareFrameId, onPrepareFrame, nullptr);
   msgApi->ReleaseMsgID(getVpxApiId);
   msgApi->ReleaseMsgID(onGameStartId);
   msgApi->ReleaseMsgID(onGameEndId);
   msgApi->ReleaseMsgID(onPrepareFrameId);
   vpxApi = nullptr;
   msgApi = nullptr;
}
