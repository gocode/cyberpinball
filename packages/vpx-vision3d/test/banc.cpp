// license:GPLv3+
//
// Banc d'essai du plugin Vision3D, sans VPX ni écran : il charge la DLL, joue
// le rôle de VPX (API de messages et API VPX simulées), envoie des positions de
// tête par UDP et contrôle la vue que le plugin impose.
//
// Usage : banc-vision3d <chemin de plugin-vision3d64.dll>
// Sortie : 0 si tout passe, 1 sinon (une ligne par contrôle).

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include <cstdio>
#include <map>
#include <string>
#include <thread>
#include <vector>

#include "MsgPlugin.h"
#include "VPXPlugin.h"
#include "vue.h"

using namespace vision3d;

namespace {

int echecs = 0;

void controle(bool ok, const char* nom)
{
   std::printf("%s %s\n", ok ? "ok  " : "ECHEC", nom);
   if (!ok) echecs++;
}

bool proche(float a, float b, float tol = 0.02f) { return std::fabs(a - b) <= tol; }

// --- API de messages simulée ---------------------------------------------------
std::map<std::string, unsigned int> ids;
std::map<unsigned int, msgpi_msg_callback> abonnes;
std::vector<MsgSettingDef*> reglages;
const int PORT_ESSAI = 47421;

unsigned int MSGPIAPI getMsgID(const char* ns, const char* nom)
{
   const std::string cle = std::string(ns) + "." + nom;
   auto it = ids.find(cle);
   if (it != ids.end()) return it->second;
   const unsigned int id = (unsigned int)ids.size() + 1;
   ids[cle] = id;
   return id;
}
void MSGPIAPI subscribeMsg(const uint32_t, const unsigned int id, const msgpi_msg_callback cb, void*) { abonnes[id] = cb; }
void MSGPIAPI unsubscribeMsg(const unsigned int id, const msgpi_msg_callback, void*) { abonnes.erase(id); }
void MSGPIAPI releaseMsgID(const unsigned int) {}
void MSGPIAPI registerSetting(const uint32_t, MsgSettingDef* def)
{
   reglages.push_back(def);
   // Comme VPX : valeur enregistrée, sinon valeur par défaut.
   if (std::string(def->propId) == "Port") def->intDef.Set(PORT_ESSAI);
   else if (def->type == MSGPI_SETTING_TYPE_FLOAT) def->floatDef.Set(def->floatDef.defVal);
   else if (def->type == MSGPI_SETTING_TYPE_INT) def->intDef.Set(def->intDef.defVal);
}

// --- API VPX simulée ---------------------------------------------------------
VPXPluginAPI vpx{};
VPXViewSetupDef vueTable{};
VPXViewSetupDef derniereVueImposee{};
int vuesImposees = 0;
int preRenduCoupe = -1;
int notifications = 0;

void MSGPIAPI getTableInfo(VPXTableInfo* info) { info->path = "essai.vpx"; info->tableWidth = 952.f; info->tableHeight = 2162.f; }
void MSGPIAPI getActiveViewSetup(VPXViewSetupDef* v) { *v = vueTable; }
void MSGPIAPI setActiveViewSetup(VPXViewSetupDef* v) { derniereVueImposee = *v; vueTable.viewX = v->viewX; vueTable.viewY = v->viewY; vueTable.viewZ = v->viewZ; vuesImposees++; }
void MSGPIAPI disableStaticPrerendering(const int d) { preRenduCoupe = d; }
unsigned int MSGPIAPI pushNotification(const char*, const int) { notifications++; return 1; }

void MSGPIAPI broadcastMsg(const uint32_t, const unsigned int id, void* data)
{
   if (id == getMsgID(VPXPI_NAMESPACE, VPXPI_MSG_GET_API))
      *static_cast<VPXPluginAPI**>(data) = &vpx;
}

void evenement(const char* nom)
{
   const unsigned int id = getMsgID(VPXPI_NAMESPACE, nom);
   auto it = abonnes.find(id);
   if (it != abonnes.end()) it->second(id, nullptr, nullptr);
}

// --- Envoi UDP ------------------------------------------------------------------
SOCKET envoi = INVALID_SOCKET;
void envoyerTete(double x, double y, double z)
{
   double paquet[6] = { x, y, z, 0., 0., 0. };
   sockaddr_in a{};
   a.sin_family = AF_INET;
   a.sin_port = htons(PORT_ESSAI);
   a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
   sendto(envoi, reinterpret_cast<const char*>(paquet), sizeof(paquet), 0, reinterpret_cast<sockaddr*>(&a), sizeof(a));
}

void attendre(int ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

// --- Contrôles du calcul seul ---------------------------------------------------
void controlesCalcul()
{
   VueDeBase b{ MODE_WINDOW, { 0.f, -200.f, 1300.f }, 2162.f, 0.f, 0.f, 0.f };
   const float u = cmVersVpu(10.f);
   Vec3 v = vuePourDeplacement(b, { 10.f, 0.f, 0.f }, 1.f);
   controle(proche(v.x, u) && proche(v.y, -200.f) && proche(v.z, 1300.f), "fenetre : tete a droite -> vue a droite");
   v = vuePourDeplacement(b, { 0.f, 10.f, 0.f }, 1.f);
   controle(proche(v.z, 1300.f + u) && proche(v.x, 0.f), "fenetre : tete plus haute -> vue plus haute");
   v = vuePourDeplacement(b, { 0.f, 0.f, 10.f }, 1.f);
   controle(proche(v.y, -200.f + u), "fenetre : tete reculee -> vue vers le joueur (Y positif, comme les tables)");
   // Même sens en mode Window et en mode Camera : reculer éloigne toujours la caméra du plateau.
   VueDeBase cam{ MODE_CAMERA, { 0.f, 0.f, 0.f }, 2162.f, 0.f, 0.f, 0.f };
   controle(vuePourDeplacement(cam, { 0.f, 0.f, 10.f }, 1.f).y > 0.f && vuePourDeplacement(b, { 0.f, 0.f, 10.f }, 1.f).y > -200.f, "recul : meme sens en mode Window et Camera");
   v = vuePourDeplacement(b, { 0.f, 0.f, 0.f }, 1.f);
   controle(proche(v.x, 0.f) && proche(v.y, -200.f) && proche(v.z, 1300.f), "fenetre : position neutre inchangee");

   // Écran incliné de 6° : le déplacement suit la même rotation que VPX
   // (ViewSetup::SetViewPosFromPlayerPosition).
   VueDeBase bi = b;
   bi.inclinaisonEcran = 6.f;
   v = vuePourDeplacement(bi, { 0.f, 10.f, 0.f }, 1.f);
   const float a = -6.f * 3.14159265f / 180.f;
   controle(proche(v.y, -200.f - std::sin(a) * u) && proche(v.z, 1300.f + std::cos(a) * u), "fenetre : ecran incline, rotation de VPX");

   v = vuePourDeplacement(b, { 10.f, 0.f, 0.f }, 2.f);
   controle(proche(v.x, 2.f * u), "gain double");

   VueDeBase c{ MODE_CAMERA, { 0.f, 0.f, 0.f }, 2162.f, 0.f, 0.f, 0.f };
   v = vuePourDeplacement(c, { 1.f, 2.f, 3.f }, 1.f);
   controle(proche(v.x, cmVersVpu(1.f)) && proche(v.y, cmVersVpu(3.f)) && proche(v.z, cmVersVpu(2.f)), "camera : droite, recul, hauteur");

   controle(attenuationSilence(0.1) == 1.f && attenuationSilence(2.0) == 0.f && attenuationSilence(0.65) > 0.f && attenuationSilence(0.65) < 1.f, "retour progressif au neutre");

   unsigned char paquet[48] = {};
   double val[6] = { 1.5, -2.5, 3.5, 0, 0, 0 };
   std::memcpy(paquet, val, 48);
   Vec3 d;
   controle(lirePaquet(paquet, 48, d) && proche(d.x, 1.5f) && proche(d.y, -2.5f) && proche(d.z, 3.5f), "lecture d'un paquet opentrack");
   controle(!lirePaquet(paquet, 47, d), "paquet tronque refuse");
   val[0] = 1e9;
   std::memcpy(paquet, val, 48);
   controle(!lirePaquet(paquet, 48, d), "valeur aberrante refusee");
}

} // namespace

int main(int argc, char** argv)
{
   if (argc < 2)
   {
      std::fprintf(stderr, "usage : banc-vision3d <plugin-vision3d64.dll>\n");
      return 2;
   }
   controlesCalcul();

   HMODULE dll = LoadLibraryA(argv[1]);
   controle(dll != nullptr, "chargement de la DLL");
   if (!dll) return 1;
   using FnLoad = void(MSGPIAPI*)(const uint32_t, const MsgPluginAPI*);
   using FnUnload = void(MSGPIAPI*)();
   auto charger = reinterpret_cast<FnLoad>(GetProcAddress(dll, "Vision3DPluginLoad"));
   auto decharger = reinterpret_cast<FnUnload>(GetProcAddress(dll, "Vision3DPluginUnload"));
   controle(charger && decharger, "points d'entree Vision3DPluginLoad / Unload");
   if (!charger || !decharger) return 1;

   MsgPluginAPI msg{};
   msg.GetMsgID = getMsgID;
   msg.SubscribeMsg = subscribeMsg;
   msg.UnsubscribeMsg = unsubscribeMsg;
   msg.BroadcastMsg = broadcastMsg;
   msg.ReleaseMsgID = releaseMsgID;
   msg.RegisterSetting = registerSetting;
   vpx.GetTableInfo = getTableInfo;
   vpx.GetActiveViewSetup = getActiveViewSetup;
   vpx.SetActiveViewSetup = setActiveViewSetup;
   vpx.DisableStaticPrerendering = disableStaticPrerendering;
   vpx.PushNotification = pushNotification;

   vueTable.viewMode = MODE_WINDOW;
   vueTable.viewX = 0.f; vueTable.viewY = -200.f; vueTable.viewZ = 1300.f;
   const VueDeBase base{ MODE_WINDOW, { 0.f, -200.f, 1300.f }, 2162.f, 0.f, 0.f, 0.f };

   WSADATA wsa;
   WSAStartup(MAKEWORD(2, 2), &wsa);
   envoi = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);

   charger(1, &msg);
   controle(reglages.size() == 2, "reglages Port et Gain declares");
   evenement(VPXPI_EVT_ON_GAME_START);
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   controle(vuesImposees == 0 && preRenduCoupe == -1, "sans capteur : vue et pre-rendu intacts");

   envoyerTete(5., 0., 0.);
   attendre(150);
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   Vec3 attendu = vuePourDeplacement(base, { 5.f, 0.f, 0.f }, 1.f);
   controle(vuesImposees == 1 && proche(derniereVueImposee.viewX, attendu.x) && proche(derniereVueImposee.viewY, attendu.y), "tete a droite recue par UDP -> vue deplacee");
   controle(preRenduCoupe == 1, "premier paquet : pre-rendu statique coupe");

   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   controle(vuesImposees == 1, "meme position : aucun recalcul");

   envoyerTete(0., 3., -4.);
   attendre(150);
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   attendu = vuePourDeplacement(base, { 0.f, 3.f, -4.f }, 1.f);
   controle(proche(derniereVueImposee.viewZ, attendu.z) && proche(derniereVueImposee.viewY, attendu.y), "tete plus haute et plus proche");

   attendre(1200); // capteur muet : retour au neutre
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   controle(proche(derniereVueImposee.viewX, 0.f) && proche(derniereVueImposee.viewY, -200.f) && proche(derniereVueImposee.viewZ, 1300.f), "capteur muet -> retour a la vue neutre");

   envoyerTete(8., 0., 0.);
   attendre(150);
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   evenement(VPXPI_EVT_ON_GAME_END);
   controle(proche(vueTable.viewX, 0.f) && proche(vueTable.viewY, -200.f) && proche(vueTable.viewZ, 1300.f), "fin de partie : vue d'origine rendue");
   controle(preRenduCoupe == 0, "fin de partie : pre-rendu statique retabli");

   // Une partie sans capteur ne touche à rien, même après une partie suivie.
   preRenduCoupe = -1;
   vuesImposees = 0;
   evenement(VPXPI_EVT_ON_GAME_START);
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   evenement(VPXPI_EVT_ON_GAME_END);
   controle(preRenduCoupe == -1 && vuesImposees == 1, "partie sans capteur : pre-rendu jamais touche");

   // Une partie suivie rouvre le port (fil de réception relancé proprement).
   evenement(VPXPI_EVT_ON_GAME_START);
   envoyerTete(-6., 0., 0.);
   attendre(150);
   evenement(VPXPI_EVT_ON_PREPARE_FRAME);
   attendu = vuePourDeplacement(base, { -6.f, 0.f, 0.f }, 1.f);
   controle(proche(derniereVueImposee.viewX, attendu.x), "deuxieme partie : suivi actif");
   evenement(VPXPI_EVT_ON_GAME_END);

   decharger();
   controle(abonnes.empty(), "dechargement : abonnements retires");
   FreeLibrary(dll);
   closesocket(envoi);
   WSACleanup();

   std::printf("%s (%d echec(s))\n", echecs == 0 ? "BANC VISION3D : OK" : "BANC VISION3D : ECHEC", echecs);
   return echecs == 0 ? 0 : 1;
}
