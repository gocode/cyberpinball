// Cyber Pinball : le menu dans le casque.
//
// Compagnon de Cyber Pinball (app/src/casque.ts) : il recopie les écrans de la borne (duplication
// de bureau de DXGI, l'affichage des écrans ne change pas) et les pose dans le casque en panneaux
// OpenXR (couches « quad »), là où Cyber Pinball les place (packages/core/src/casque.ts). Aucune
// fenêtre : Cyber Pinball garde le premier plan, les boutons de la borne et le clavier.
//
// Le chargeur OpenXR est celui de la copie de VPX de Cyber Pinball (openxr_loader64.dll), passé
// en argument : rien n'est installé dans Windows.
//
// Protocole, une ligne par message.
//   Entrée standard :
//     panneau <rôle> <x> <y> <largeur> <hauteur> <px> <py> <pz> <qx> <qy> <qz> <qw> <largeurM> <hauteurM>
//       rectangle source sur le bureau (pixels physiques), pose du panneau dans l'espace de la borne
//       (mètres : origine au sol sous le joueur, x à droite, y en haut, -z devant lui), taille en mètres ;
//     fin                (fin de la description : le casque s'ouvre)
//     source <rôle> <surface> <fx> <fy> <fl> <fh>
//                        le panneau prend ses images dans la surface <surface> (une fenêtre de Cyber
//                        Pinball rendue hors écran pour le casque), rectangle en fractions de la
//                        surface ; son image dans le casque a la taille de ce rectangle dans la
//                        texture reçue ; sans source : la duplication de son écran
//     texture <surface> <image> <handle> <largeur> <hauteur>
//                        une image de la surface : la texture partagée d'Electron, son handle dupliqué
//                        dans ce processus (un neuf à chaque image : Electron en ouvre un par image,
//                        et Windows en recycle les numéros ; rien n'est gardé d'une image à l'autre)
//     scene, puis boite … | quad … | disque …, puis scene-fin
//                        (la borne en volume autour des panneaux, packages/core/src/casque-scene.ts ;
//                        un nouveau bloc remplace le précédent, par exemple quand la teinte change)
//     ancre <x> <z> <lacet> (place de la borne dans la pièce, gardée par Cyber Pinball : sans elle, la
//                        borne se pose devant le joueur au premier regard suivi)
//     recentrer          (la borne revient devant le joueur)
//     releve             (une partie de VPX démarre : garder le casque, écrans de chargement compris, jusqu'à
//                        ce que VPX le prenne, puis fondu au noir et fin ; deux minutes au plus)
//     instantane <dossier> (l'image de chaque panneau, telle qu'envoyée au casque, en <rôle>.bmp)
//     quitter            (fondu au noir de 300 ms, puis fin propre de la session)
//   Sortie standard :
//     pret <runtime> | casque-absent <raison> | erreur <texte> | etat <état OpenXR> | centre … | image <rôle>
//     | libre <image> (image copiée : Electron peut reprendre sa texture) | porte 1|0 (casque porté ou non)
//     | scene <n> formes | fini

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_D3D11
#define XR_NO_PROTOTYPES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include "scene.h"

#include <atomic>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace {

void say(const std::string& line)
{
   static std::mutex m;
   std::lock_guard<std::mutex> lock(m);
   std::fputs((line + "\n").c_str(), stdout);
   std::fflush(stdout);
}

std::string hex(long v)
{
   char b[16];
   std::snprintf(b, sizeof b, "0x%08lX", static_cast<unsigned long>(v));
   return b;
}

// ---------------------------------------------------------------------------
// Fonctions OpenXR, chargées depuis le chargeur de VPX.

PFN_xrGetInstanceProcAddr xrGetInstanceProcAddr_ = nullptr;
#define XR_FUNCS(X) \
   X(xrDestroyInstance) X(xrGetInstanceProperties) X(xrGetSystem) X(xrCreateSession) X(xrDestroySession) \
   X(xrBeginSession) X(xrEndSession) X(xrRequestExitSession) X(xrPollEvent) X(xrWaitFrame) X(xrBeginFrame) \
   X(xrEndFrame) X(xrCreateReferenceSpace) X(xrDestroySpace) X(xrEnumerateReferenceSpaces) X(xrLocateSpace) \
   X(xrEnumerateSwapchainFormats) X(xrCreateSwapchain) X(xrDestroySwapchain) X(xrEnumerateSwapchainImages) \
   X(xrAcquireSwapchainImage) X(xrWaitSwapchainImage) X(xrReleaseSwapchainImage) X(xrResultToString) \
   X(xrEnumerateViewConfigurationViews) X(xrLocateViews) X(xrStringToPath) X(xrCreateActionSet) X(xrCreateAction) \
   X(xrSuggestInteractionProfileBindings) X(xrAttachSessionActionSets) X(xrSyncActions) X(xrGetActionStateBoolean) \
   X(xrCreateActionSpace)
#define DECLARE(name) PFN_##name name##_ = nullptr;
XR_FUNCS(DECLARE)
PFN_xrGetD3D11GraphicsRequirementsKHR xrGetD3D11GraphicsRequirementsKHR_ = nullptr;

bool loadInstanceFunctions(XrInstance instance)
{
#define LOAD(name) if (XR_FAILED(xrGetInstanceProcAddr_(instance, #name, reinterpret_cast<PFN_xrVoidFunction*>(&name##_)))) return false;
   XR_FUNCS(LOAD)
   LOAD(xrGetD3D11GraphicsRequirementsKHR)
#undef LOAD
   return true;
}

// ---------------------------------------------------------------------------
// Petite géométrie : poses OpenXR (rotation unitaire puis translation).

XrQuaternionf mul(const XrQuaternionf& a, const XrQuaternionf& b)
{
   return { a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z };
}

XrVector3f rotate(const XrQuaternionf& q, const XrVector3f& v)
{
   const XrQuaternionf p { v.x, v.y, v.z, 0.f };
   const XrQuaternionf c { -q.x, -q.y, -q.z, q.w };
   const XrQuaternionf r = mul(mul(q, p), c);
   return { r.x, r.y, r.z };
}

XrPosef compose(const XrPosef& parent, const XrPosef& child)
{
   const XrVector3f t = rotate(parent.orientation, child.position);
   return { mul(parent.orientation, child.orientation), { parent.position.x + t.x, parent.position.y + t.y, parent.position.z + t.z } };
}

// ---------------------------------------------------------------------------

struct Panel
{
   std::string role;
   RECT source {}; // sur le bureau
   XrPosef pose {}; // dans l'espace de la borne
   XrExtent2Df size {};
   int output = -1; // index dans outputs
   RECT inOutput {}; // rectangle source dans l'image de l'écran
   XrSwapchain swapchain = XR_NULL_HANDLE;
   std::vector<XrSwapchainImageD3D11KHR> images;
   bool shown = false; // première image copiée (dite une fois dans le journal)
   std::string surface; // source : surface rendue hors écran par Cyber Pinball (vide : duplication)
   float fx = 0, fy = 0, fw = 1, fh = 1; // place du panneau dans la surface, en fractions
   UINT width = 0, height = 0; // taille de son image dans le casque (source : créée à la première image)
   uint64_t copied = 0; // génération de l'image de l'écran déjà dans le casque
};

struct Output
{
   ComPtr<IDXGIOutput1> output;
   RECT desktop {};
   ComPtr<IDXGIOutputDuplication> dup;
   ComPtr<ID3D11Texture2D> copy; // dernière image reçue (avec ses mipmaps)
   ComPtr<ID3D11ShaderResourceView> view; // de quoi la dessiner dans la couche de projection
   UINT width = 0, height = 0;
   DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
   bool reported = false;
   uint64_t generation = 0; // compte les nouvelles images de l'écran
};

std::atomic<bool> wantRecenter { true };
/** Place de la borne donnée par Cyber Pinball (ancre), prise par la boucle d'images. */
std::atomic<bool> anchorGiven { false };
float anchorX = 0, anchorY = 0, anchorZ = 0, anchorYaw = 0;
/** Calage de la borne en cours (Cyber Pinball : « calage 1|0 ») : points touchés et repères des manettes. */
std::atomic<bool> calibrating { false };
std::atomic<bool> wantQuit { false };
/** Relève demandée par Cyber Pinball (une partie de VPX démarre), et quand. */
std::atomic<bool> handover { false };
std::atomic<ULONGLONG> handoverAt { 0 };
/** Instantané des panneaux demandé, et son dossier. */
std::atomic<bool> wantSnapshot { false };
/** Sources des panneaux (rôle → surface et décalage), et images reçues des surfaces. */
struct SourceOf
{
   std::string surface;
   float fx = 0, fy = 0, fw = 1, fh = 1;
};
std::map<std::string, SourceOf> sourcesByRole;
struct IncomingImage
{
   std::string surface, frame;
   unsigned long long handle = 0;
};
std::mutex imagesMutex;
std::vector<IncomingImage> incoming;
std::string snapshotDir;
std::atomic<bool> described { false };
std::mutex panelsMutex;
std::vector<Panel> pending;
/** Dernier bloc de scène complet reçu, à prendre par la boucle d'images. */
std::vector<std::string> sceneLines;
std::atomic<bool> sceneReady { false };

void readCommands()
{
   std::string line;
   std::vector<std::string> block;
   bool inScene = false;
   while (std::getline(std::cin, line))
   {
      std::istringstream in(line);
      std::string word;
      in >> word;
      if (word == "scene")
      {
         block.clear();
         inScene = true;
      }
      else if (word == "scene-fin")
      {
         std::lock_guard<std::mutex> lock(panelsMutex);
         sceneLines = block;
         sceneReady = true;
         inScene = false;
      }
      else if (inScene)
         block.push_back(line);
      else if (word == "panneau" && !described)
      {
         Panel p;
         float px, py, pz, qx, qy, qz, qw;
         long x, y, w, h;
         in >> p.role >> x >> y >> w >> h >> px >> py >> pz >> qx >> qy >> qz >> qw >> p.size.width >> p.size.height;
         if (!in || w <= 0 || h <= 0)
         {
            say("erreur panneau illisible : " + line);
            continue;
         }
         p.source = { x, y, x + w, y + h };
         p.pose = { { qx, qy, qz, qw }, { px, py, pz } };
         std::lock_guard<std::mutex> lock(panelsMutex);
         pending.push_back(p);
      }
      else if (word == "fin")
         described = true;
      else if (word == "recentrer")
         wantRecenter = true;
      else if (word == "source")
      {
         std::string role;
         SourceOf src;
         in >> role >> src.surface >> src.fx >> src.fy >> src.fw >> src.fh;
         if (in)
         {
            std::lock_guard<std::mutex> lock(panelsMutex);
            sourcesByRole[role] = src;
         }
      }
      else if (word == "texture")
      {
         IncomingImage img;
         in >> img.surface >> img.frame >> img.handle;
         if (in)
         {
            std::lock_guard<std::mutex> lock(imagesMutex);
            incoming.push_back(img);
         }
      }
      else if (word == "ancre")
      {
         float x, z, yaw, y = 0;
         in >> x >> z >> yaw;
         if (in)
         {
            // Hauteur facultative : la borne calée sur une barre avant plus haute ou plus basse que 85 cm.
            if (!(in >> y))
               y = 0;
            std::lock_guard<std::mutex> lock(panelsMutex);
            anchorX = x, anchorY = y, anchorZ = z, anchorYaw = yaw;
            anchorGiven = true;
            wantRecenter = false;
         }
      }
      else if (word == "calage")
      {
         int on = 0;
         in >> on;
         calibrating = on != 0;
      }
      else if (word == "releve")
      {
         handoverAt = GetTickCount64();
         handover = true;
      }
      else if (word == "instantane")
      {
         std::string dir;
         std::getline(in >> std::ws, dir);
         std::lock_guard<std::mutex> lock(panelsMutex);
         snapshotDir = dir;
         wantSnapshot = true;
      }
      else if (word == "quitter")
         break;
   }
   // Entrée fermée (Cyber Pinball parti) ou « quitter » : fin propre.
   wantQuit = true;
}

bool contains(const RECT& outer, const RECT& inner)
{
   return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
}

std::string narrow(const wchar_t* w)
{
   char b[256] {};
   WideCharToMultiByte(CP_UTF8, 0, w, -1, b, sizeof b - 1, nullptr, nullptr);
   return b;
}

// --diagnostic : chaque carte, chacun de ses écrans, et ce que donne leur duplication (format, image
// reçue, luminosité moyenne). Aucune session OpenXR : rien ne paraît dans le casque.
/** Image BGRA (lignes de `pitch` octets) en BMP 24 bits. */
bool writeBmp(const std::string& path, const unsigned char* pixels, UINT pitch, UINT W, UINT H)
{
   std::ofstream out(path, std::ios::binary);
   if (!out)
      return false;
   const uint32_t row = W * 3, pad = (4 - row % 4) % 4, size = 54 + (row + pad) * H;
   unsigned char header[54] = { 'B', 'M' };
   auto put32 = [&](int at, uint32_t v) { for (int i = 0; i < 4; i++) header[at + i] = static_cast<unsigned char>(v >> (8 * i)); };
   put32(2, size), put32(10, 54), put32(14, 40), put32(18, W), put32(22, H);
   header[26] = 1, header[28] = 24;
   out.write(reinterpret_cast<const char*>(header), 54);
   for (int y = static_cast<int>(H) - 1; y >= 0; y--)
   {
      const unsigned char* src = pixels + y * pitch;
      for (UINT x = 0; x < W; x++)
         out.put(static_cast<char>(src[x * 4])), out.put(static_cast<char>(src[x * 4 + 1])), out.put(static_cast<char>(src[x * 4 + 2]));
      for (uint32_t i = 0; i < pad; i++)
         out.put(0);
   }
   return true;
}

// --rendu-essai <scène> <image.bmp> : la scène (lignes du protocole : panneau, boite, quad, disque),
// vue de la place du joueur, rendue hors écran dans une image. Les panneaux y portent une image
// témoin (coin haut-gauche rouge, haut-droit vert, bas-gauche bleu, dégradé gris), dessinée comme
// dans le casque : dans la couche de projection, avec la profondeur (scene::ImageRenderer). Pour
// vérifier la géométrie, l'orientation des images et les couleurs sans casque.
int renderTest(const std::string& input, const std::string& output)
{
   std::ifstream file(input);
   if (!file)
   {
      say("erreur scène illisible : " + input);
      return 2;
   }
   std::vector<scene::Vertex> opaque, transparent;
   struct TestPanel
   {
      XrPosef pose;
      float width, height;
   };
   std::vector<TestPanel> testPanels;
   std::string line;
   while (std::getline(file, line))
   {
      std::istringstream in(line);
      std::string word;
      in >> word;
      if (word == "panneau")
      {
         std::string role;
         float x, y, w, h, px, py, pz, qx, qy, qz, qw, mw, mh;
         in >> role >> x >> y >> w >> h >> px >> py >> pz >> qx >> qy >> qz >> qw >> mw >> mh;
         testPanels.push_back({ { { qx, qy, qz, qw }, { px, py, pz } }, mw, mh });
      }
      else
         scene::addPrimitive(line, opaque, transparent);
   }
   ComPtr<ID3D11Device> device;
   ComPtr<ID3D11DeviceContext> context;
   if (FAILED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, &device, nullptr, &context)))
      return 4;
   scene::Renderer renderer;
   scene::ImageRenderer imageRenderer;
   std::string error;
   if (!renderer.init(device.Get(), error) || !imageRenderer.init(device.Get(), error))
   {
      say("erreur " + error);
      return 4;
   }
   renderer.setScene(opaque, transparent);
   // Image témoin, en octets d'écran (BGRA, sRGB), avec ses mipmaps.
   constexpr UINT TW = 512, TH = 256;
   std::vector<unsigned char> pattern(TW * TH * 4);
   for (UINT ty = 0; ty < TH; ty++)
      for (UINT tx = 0; tx < TW; tx++)
      {
         unsigned char* px = &pattern[(ty * TW + tx) * 4];
         const unsigned char g = static_cast<unsigned char>(40 + 180 * tx / TW);
         px[0] = px[1] = px[2] = g, px[3] = 255;
         const bool left = tx < TW / 4, right = tx >= TW * 3 / 4, top = ty < TH / 3, bottom = ty >= TH * 2 / 3;
         if (left && top)
            px[0] = 0, px[1] = 0, px[2] = 230; // rouge
         else if (right && top)
            px[0] = 0, px[1] = 200, px[2] = 0; // vert
         else if (left && bottom)
            px[0] = 230, px[1] = 0, px[2] = 0; // bleu
      }
   ComPtr<ID3D11Texture2D> patternTexture;
   ComPtr<ID3D11ShaderResourceView> patternView;
   if (!scene::makeImage(device.Get(), TW, TH, DXGI_FORMAT_B8G8R8A8_UNORM, patternTexture, patternView))
      return 4;
   context->UpdateSubresource(patternTexture.Get(), 0, nullptr, pattern.data(), TW * 4, 0);
   context->GenerateMips(patternView.Get());
   constexpr UINT W = 1600, H = 1000;
   D3D11_TEXTURE2D_DESC td {};
   td.Width = W;
   td.Height = H;
   td.MipLevels = 1;
   td.ArraySize = 1;
   td.Format = DXGI_FORMAT_B8G8R8A8_UNORM_SRGB;
   td.SampleDesc.Count = 1;
   td.Usage = D3D11_USAGE_DEFAULT;
   td.BindFlags = D3D11_BIND_RENDER_TARGET;
   ComPtr<ID3D11Texture2D> color, staging, depthTexture;
   device->CreateTexture2D(&td, nullptr, &color);
   td.Usage = D3D11_USAGE_STAGING;
   td.BindFlags = 0;
   td.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
   device->CreateTexture2D(&td, nullptr, &staging);
   td.Usage = D3D11_USAGE_DEFAULT;
   td.CPUAccessFlags = 0;
   td.Format = DXGI_FORMAT_D32_FLOAT;
   td.BindFlags = D3D11_BIND_DEPTH_STENCIL;
   device->CreateTexture2D(&td, nullptr, &depthTexture);
   ComPtr<ID3D11RenderTargetView> target;
   ComPtr<ID3D11DepthStencilView> depth;
   device->CreateRenderTargetView(color.Get(), nullptr, &target);
   device->CreateDepthStencilView(depthTexture.Get(), nullptr, &depth);
   context->ClearRenderTargetView(target.Get(), scene::kVoid);
   context->ClearDepthStencilView(depth.Get(), D3D11_CLEAR_DEPTH, 1.f, 0);
   context->OMSetRenderTargets(1, target.GetAddressOf(), depth.Get());
   const D3D11_VIEWPORT viewport { 0, 0, static_cast<float>(W), static_cast<float>(H), 0, 1 };
   context->RSSetViewports(1, &viewport);
   // Joueur debout un pas en arrière (yeux à 1,65 m), regard 25° vers le bas ; champ de 100° en largeur.
   const float pitch = -0.436f;
   const float eyeQ[4] = { std::sin(pitch / 2), 0, 0, std::cos(pitch / 2) };
   const float eyeT[3] = { 0.f, 1.65f, 0.35f };
   const float half = 0.8727f;
   const float vertical = std::atan(std::tan(half) * H / W);
   const scene::Mat4 world = scene::Mat4::identity();
   const scene::Mat4 mvp = scene::Mat4::projection(-half, half, vertical, -vertical, 0.05f, 50.f) * scene::Mat4::poseInverse(eyeQ, eyeT) * world;
   renderer.draw(context.Get(), mvp, world, 1.f);
   // Les panneaux comme dans le casque : dans la même couche, avec la profondeur.
   const float fullImage[4] = { 0, 0, 1, 1 };
   for (const TestPanel& p : testPanels)
   {
      const float hw = p.width / 2, hh = p.height / 2;
      const XrVector3f local[4] = { { -hw, hh, 0 }, { hw, hh, 0 }, { -hw, -hh, 0 }, { hw, -hh, 0 } };
      float corners[4][3];
      for (int c = 0; c < 4; c++)
      {
         const XrVector3f r = rotate(p.pose.orientation, local[c]);
         corners[c][0] = r.x + p.pose.position.x, corners[c][1] = r.y + p.pose.position.y, corners[c][2] = r.z + p.pose.position.z;
      }
      imageRenderer.draw(context.Get(), mvp, corners, fullImage, patternView.Get(), 1.f);
   }
   context->CopyResource(staging.Get(), color.Get());
   D3D11_MAPPED_SUBRESOURCE m;
   if (FAILED(context->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &m)))
      return 4;
   writeBmp(output, static_cast<const unsigned char*>(m.pData), m.RowPitch, W, H);
   context->Unmap(staging.Get(), 0);
   say("image " + output + " (" + std::to_string(opaque.size() / 3 + transparent.size() / 3) + " triangles)");
   return 0;
}

/**
 * Texture partagée par Electron (rendu hors écran, webPreferences.offscreen.useSharedTexture) :
 * Cyber Pinball a dupliqué son NT HANDLE dans ce processus. Le handle est fermé ici, la texture
 * gardée ouverte.
 */
ComPtr<ID3D11Texture2D> openShared(ID3D11Device* device, HANDLE handle)
{
   ComPtr<ID3D11Device1> device1;
   ComPtr<ID3D11Texture2D> texture;
   if (SUCCEEDED(device->QueryInterface(IID_PPV_ARGS(&device1))))
      device1->OpenSharedResource1(handle, IID_PPV_ARGS(&texture));
   CloseHandle(handle);
   return texture;
}

/** Attend que le GPU ait fini ce qui est demandé (une copie depuis une texture qu'Electron va reprendre). */
void gpuFinish(ID3D11Device* device, ID3D11DeviceContext* context)
{
   D3D11_QUERY_DESC qd { D3D11_QUERY_EVENT, 0 };
   ComPtr<ID3D11Query> query;
   if (FAILED(device->CreateQuery(&qd, &query)))
      return;
   context->End(query.Get());
   context->Flush();
   BOOL done = FALSE;
   for (int i = 0; i < 2000 && context->GetData(query.Get(), &done, sizeof done, 0) == S_FALSE; i++)
      Sleep(0);
}

// --essai-textures <dossier> : reçoit des textures d'Electron (« texture <clé> <handle> <largeur>
// <hauteur> »), écrit chacune en <clé>.bmp et répond « libre <clé> » ; « fin » : terminé. Aucune
// session OpenXR : la chaîne Electron → compagnon se vérifie sans casque.
int textureTest(const std::string& dir)
{
   ComPtr<ID3D11Device> device;
   ComPtr<ID3D11DeviceContext> context;
   if (FAILED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, &device, nullptr, &context)))
      return 4;
   CreateDirectoryA(dir.c_str(), nullptr);
   say("pret essai-textures");
   std::string line;
   while (std::getline(std::cin, line))
   {
      std::istringstream in(line);
      std::string word, key;
      unsigned long long value = 0;
      UINT w = 0, h = 0;
      in >> word;
      if (word == "fin")
         break;
      if (word != "texture" || !(in >> key >> value >> w >> h))
         continue;
      ComPtr<ID3D11Texture2D> texture = openShared(device.Get(), reinterpret_cast<HANDLE>(value));
      if (!texture)
      {
         say("erreur texture " + key + " : ouverture refusée");
         say("libre " + key);
         continue;
      }
      D3D11_TEXTURE2D_DESC td;
      texture->GetDesc(&td);
      D3D11_TEXTURE2D_DESC sd = td;
      sd.Usage = D3D11_USAGE_STAGING;
      sd.BindFlags = 0;
      sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
      sd.MiscFlags = 0;
      ComPtr<ID3D11Texture2D> staging;
      device->CreateTexture2D(&sd, nullptr, &staging);
      context->CopyResource(staging.Get(), texture.Get());
      gpuFinish(device.Get(), context.Get());
      say("libre " + key);
      D3D11_MAPPED_SUBRESOURCE m;
      if (SUCCEEDED(context->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &m)))
      {
         writeBmp(dir + "\\" + key + ".bmp", static_cast<const unsigned char*>(m.pData), m.RowPitch, td.Width, td.Height);
         context->Unmap(staging.Get(), 0);
         say("image " + key + " " + std::to_string(td.Width) + "x" + std::to_string(td.Height) + " format " + std::to_string(static_cast<int>(td.Format)));
      }
   }
   return 0;
}

// --essai-surfaces <dossier> : le protocole de Cyber Pinball sans casque. Le compagnon se dit prêt
// et « porté », reçoit les images des écrans rendus pour le casque (texture <surface> <image>
// <handle> …), répond « libre » et écrit la dernière de chaque surface en <surface>.bmp toutes les
// 2 s. Pour vérifier hors écran ce que le casque recevrait, menu compris.
int surfacesTest(const std::string& dir)
{
   ComPtr<ID3D11Device> device;
   ComPtr<ID3D11DeviceContext> context;
   if (FAILED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, &device, nullptr, &context)))
      return 4;
   CreateDirectoryA(dir.c_str(), nullptr);
   std::map<std::string, ULONGLONG> written;
   std::string line;
   while (std::getline(std::cin, line))
   {
      std::istringstream in(line);
      std::string word;
      in >> word;
      if (word == "fin")
      {
         say("pret essai-surfaces");
         say("porte 1");
         continue;
      }
      if (word == "quitter")
         break;
      if (word != "texture")
         continue;
      std::string surface, frame;
      unsigned long long handle = 0;
      if (!(in >> surface >> frame >> handle))
         continue;
      const ULONGLONG now = GetTickCount64();
      const bool write = now - written[surface] > 2000;
      if (!write)
      {
         CloseHandle(reinterpret_cast<HANDLE>(handle));
         say("libre " + frame);
         continue;
      }
      ComPtr<ID3D11Texture2D> texture = openShared(device.Get(), reinterpret_cast<HANDLE>(handle));
      if (!texture)
      {
         say("erreur texture " + surface + " : ouverture refusée");
         say("libre " + frame);
         continue;
      }
      D3D11_TEXTURE2D_DESC td;
      texture->GetDesc(&td);
      D3D11_TEXTURE2D_DESC sd = td;
      sd.Usage = D3D11_USAGE_STAGING;
      sd.BindFlags = 0;
      sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
      sd.MiscFlags = 0;
      ComPtr<ID3D11Texture2D> staging;
      device->CreateTexture2D(&sd, nullptr, &staging);
      context->CopyResource(staging.Get(), texture.Get());
      gpuFinish(device.Get(), context.Get());
      say("libre " + frame);
      D3D11_MAPPED_SUBRESOURCE m;
      if (SUCCEEDED(context->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &m)))
      {
         writeBmp(dir + "\\" + surface + ".bmp", static_cast<const unsigned char*>(m.pData), m.RowPitch, td.Width, td.Height);
         context->Unmap(staging.Get(), 0);
         if (!written[surface])
            say("image " + surface + " (rendu pour le casque) " + std::to_string(td.Width) + "x" + std::to_string(td.Height));
         written[surface] = now;
      }
   }
   say("fini");
   return 0;
}

int diagnostic(const LUID* headset)
{
   ComPtr<IDXGIFactory1> factory;
   CreateDXGIFactory1(IID_PPV_ARGS(&factory));
   ComPtr<IDXGIAdapter1> adapter;
   for (UINT a = 0; factory->EnumAdapters1(a, &adapter) != DXGI_ERROR_NOT_FOUND; a++)
   {
      DXGI_ADAPTER_DESC1 ad;
      adapter->GetDesc1(&ad);
      const bool ofHeadset = headset && memcmp(&ad.AdapterLuid, headset, sizeof(LUID)) == 0;
      say("carte " + std::to_string(a) + " " + narrow(ad.Description) + (ofHeadset ? " (celle du casque)" : ""));
      ComPtr<ID3D11Device> device;
      ComPtr<ID3D11DeviceContext> context;
      if (FAILED(D3D11CreateDevice(adapter.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, &device, nullptr, &context)))
      {
         say("  Direct3D 11 indisponible sur cette carte");
         continue;
      }
      ComPtr<IDXGIOutput> o;
      for (UINT i = 0; adapter->EnumOutputs(i, &o) != DXGI_ERROR_NOT_FOUND; i++, o.Reset())
      {
         DXGI_OUTPUT_DESC d;
         o->GetDesc(&d);
         const RECT& r = d.DesktopCoordinates;
         std::string line = "  écran " + narrow(d.DeviceName) + " [" + std::to_string(r.left) + "," + std::to_string(r.top) + " " + std::to_string(r.right - r.left) + "x"
            + std::to_string(r.bottom - r.top) + "] rotation " + std::to_string(static_cast<int>(d.Rotation));
         ComPtr<IDXGIOutput1> o1;
         ComPtr<IDXGIOutputDuplication> dup;
         o.As(&o1);
         if (const HRESULT hr = o1->DuplicateOutput(device.Get(), &dup); FAILED(hr))
         {
            say(line + " : duplication refusée " + hex(hr));
            continue;
         }
         // La première image arrive tout de suite ; on en attend une avec du contenu, 1 s au plus.
         std::string result = " : aucune image en 1 s";
         for (int tries = 0; tries < 10; tries++)
         {
            DXGI_OUTDUPL_FRAME_INFO fi;
            ComPtr<IDXGIResource> res;
            if (FAILED(dup->AcquireNextFrame(100, &fi, &res)))
               continue;
            ComPtr<ID3D11Texture2D> tex;
            res.As(&tex);
            D3D11_TEXTURE2D_DESC td;
            tex->GetDesc(&td);
            D3D11_TEXTURE2D_DESC sd = td;
            sd.Usage = D3D11_USAGE_STAGING;
            sd.BindFlags = 0;
            sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
            sd.MiscFlags = 0;
            ComPtr<ID3D11Texture2D> staging;
            double mean = -1;
            if (td.Format == DXGI_FORMAT_B8G8R8A8_UNORM && SUCCEEDED(device->CreateTexture2D(&sd, nullptr, &staging)))
            {
               context->CopyResource(staging.Get(), tex.Get());
               D3D11_MAPPED_SUBRESOURCE m;
               if (SUCCEEDED(context->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &m)))
               {
                  double sum = 0;
                  size_t n = 0;
                  for (UINT y = 0; y < td.Height; y += 8)
                     for (UINT x = 0; x < td.Width; x += 8, n++)
                     {
                        const uint8_t* p = static_cast<const uint8_t*>(m.pData) + y * m.RowPitch + x * 4;
                        sum += (p[0] + p[1] + p[2]) / 3.0;
                     }
                  mean = n ? sum / n : 0;
                  context->Unmap(staging.Get(), 0);
               }
            }
            dup->ReleaseFrame();
            result = " : format " + std::to_string(static_cast<int>(td.Format)) + " " + std::to_string(td.Width) + "x" + std::to_string(td.Height)
               + (mean >= 0 ? ", luminosité moyenne " + std::to_string(static_cast<int>(mean)) : "");
            if (mean > 0)
               break;
         }
         say(line + result);
      }
   }
   return 0;
}

} // namespace

int main(int argc, char** argv)
{
   std::string loaderPath;
   bool diagnose = false;
   for (int i = 1; i < argc; i++)
   {
      if (std::string(argv[i]) == "--chargeur" && i + 1 < argc)
         loaderPath = argv[i + 1];
      if (std::string(argv[i]) == "--essai-surfaces" && i + 1 < argc)
         return surfacesTest(argv[i + 1]);
      if (std::string(argv[i]) == "--essai-textures" && i + 1 < argc)
         return textureTest(argv[i + 1]);
      if (std::string(argv[i]) == "--rendu-essai" && i + 2 < argc)
         return renderTest(argv[i + 1], argv[i + 2]);
      if (std::string(argv[i]) == "--diagnostic")
         diagnose = true;
   }
   if (diagnose)
   {
      SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
      // La carte du casque, si le runtime répond (sans session : rien dans le casque).
      LUID luid {};
      bool known = false;
      if (HMODULE l = loaderPath.empty() ? nullptr : LoadLibraryA(loaderPath.c_str()))
      {
         xrGetInstanceProcAddr_ = reinterpret_cast<PFN_xrGetInstanceProcAddr>(GetProcAddress(l, "xrGetInstanceProcAddr"));
         PFN_xrCreateInstance create = nullptr;
         if (xrGetInstanceProcAddr_)
            xrGetInstanceProcAddr_(XR_NULL_HANDLE, "xrCreateInstance", reinterpret_cast<PFN_xrVoidFunction*>(&create));
         const char* ext[] = { XR_KHR_D3D11_ENABLE_EXTENSION_NAME };
         XrInstanceCreateInfo ici { XR_TYPE_INSTANCE_CREATE_INFO };
         std::snprintf(ici.applicationInfo.applicationName, XR_MAX_APPLICATION_NAME_SIZE, "Cyber Pinball diagnostic");
         ici.applicationInfo.apiVersion = XR_API_VERSION_1_0;
         ici.enabledExtensionCount = 1;
         ici.enabledExtensionNames = ext;
         XrInstance inst = XR_NULL_HANDLE;
         if (create && XR_SUCCEEDED(create(&ici, &inst)) && loadInstanceFunctions(inst))
         {
            XrSystemGetInfo sgi { XR_TYPE_SYSTEM_GET_INFO };
            sgi.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
            XrSystemId sys = XR_NULL_SYSTEM_ID;
            XrGraphicsRequirementsD3D11KHR req { XR_TYPE_GRAPHICS_REQUIREMENTS_D3D11_KHR };
            if (XR_SUCCEEDED(xrGetSystem_(inst, &sgi, &sys)) && XR_SUCCEEDED(xrGetD3D11GraphicsRequirementsKHR_(inst, sys, &req)))
            {
               luid = req.adapterLuid;
               known = true;
            }
            else
               say("casque pas prêt : carte du casque inconnue");
            xrDestroyInstance_(inst);
         }
      }
      return diagnostic(known ? &luid : nullptr);
   }
   if (loaderPath.empty())
   {
      say("erreur chargeur OpenXR non indiqué (--chargeur)");
      return 2;
   }

   // Coordonnées du bureau en pixels physiques, comme celles que donne Cyber Pinball.
   SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

   std::thread(readCommands).detach();

   HMODULE loader = LoadLibraryA(loaderPath.c_str());
   if (!loader || !(xrGetInstanceProcAddr_ = reinterpret_cast<PFN_xrGetInstanceProcAddr>(GetProcAddress(loader, "xrGetInstanceProcAddr"))))
   {
      say("erreur chargeur OpenXR illisible : " + loaderPath);
      return 2;
   }
   PFN_xrCreateInstance xrCreateInstance_ = nullptr;
   xrGetInstanceProcAddr_(XR_NULL_HANDLE, "xrCreateInstance", reinterpret_cast<PFN_xrVoidFunction*>(&xrCreateInstance_));

   // Attente de la description de la borne (envoyée tout de suite par Cyber Pinball).
   for (int i = 0; i < 200 && !described && !wantQuit; i++)
      Sleep(50);
   std::vector<Panel> panels;
   {
      std::lock_guard<std::mutex> lock(panelsMutex);
      panels = pending;
      for (Panel& p : panels)
         if (auto it = sourcesByRole.find(p.role); it != sourcesByRole.end())
            p.surface = it->second.surface, p.fx = it->second.fx, p.fy = it->second.fy, p.fw = it->second.fw, p.fh = it->second.fh;
   }
   if (wantQuit || panels.empty())
   {
      say("erreur aucun écran à montrer");
      return 2;
   }

   // Fondu au noir de toutes les couches (XR_KHR_composition_layer_color_scale_bias), si le runtime l'a.
   bool colorScale = false;
   {
      PFN_xrEnumerateInstanceExtensionProperties enumerate = nullptr;
      xrGetInstanceProcAddr_(XR_NULL_HANDLE, "xrEnumerateInstanceExtensionProperties", reinterpret_cast<PFN_xrVoidFunction*>(&enumerate));
      uint32_t n = 0;
      if (enumerate && XR_SUCCEEDED(enumerate(nullptr, 0, &n, nullptr)))
      {
         std::vector<XrExtensionProperties> list(n, { XR_TYPE_EXTENSION_PROPERTIES });
         enumerate(nullptr, n, &n, list.data());
         for (const auto& e : list)
            colorScale |= std::string(e.extensionName) == XR_KHR_COMPOSITION_LAYER_COLOR_SCALE_BIAS_EXTENSION_NAME;
      }
   }
   const char* extensions[] = { XR_KHR_D3D11_ENABLE_EXTENSION_NAME, XR_KHR_COMPOSITION_LAYER_COLOR_SCALE_BIAS_EXTENSION_NAME };
   XrInstanceCreateInfo ici { XR_TYPE_INSTANCE_CREATE_INFO };
   std::snprintf(ici.applicationInfo.applicationName, XR_MAX_APPLICATION_NAME_SIZE, "Cyber Pinball");
   ici.applicationInfo.applicationVersion = 1;
   std::snprintf(ici.applicationInfo.engineName, XR_MAX_ENGINE_NAME_SIZE, "Cyber Pinball");
   ici.applicationInfo.apiVersion = XR_API_VERSION_1_0;
   ici.enabledExtensionCount = colorScale ? 2 : 1;
   ici.enabledExtensionNames = extensions;
   XrInstance instance = XR_NULL_HANDLE;
   if (!xrCreateInstance_ || XR_FAILED(xrCreateInstance_(&ici, &instance)) || !loadInstanceFunctions(instance))
   {
      say("casque-absent aucun runtime OpenXR utilisable");
      return 3;
   }
   XrInstanceProperties props { XR_TYPE_INSTANCE_PROPERTIES };
   xrGetInstanceProperties_(instance, &props);

   XrSystemGetInfo sgi { XR_TYPE_SYSTEM_GET_INFO };
   sgi.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
   XrSystemId system = XR_NULL_SYSTEM_ID;
   if (const XrResult r = xrGetSystem_(instance, &sgi, &system); XR_FAILED(r))
   {
      char name[XR_MAX_RESULT_STRING_SIZE] {};
      xrResultToString_(instance, r, name);
      say(std::string("casque-absent ") + name);
      xrDestroyInstance_(instance);
      return 3;
   }

   // Direct3D 11 sur la carte du casque ; les écrans dupliqués doivent y être branchés.
   XrGraphicsRequirementsD3D11KHR req { XR_TYPE_GRAPHICS_REQUIREMENTS_D3D11_KHR };
   xrGetD3D11GraphicsRequirementsKHR_(instance, system, &req);
   ComPtr<IDXGIFactory1> factory;
   CreateDXGIFactory1(IID_PPV_ARGS(&factory));
   ComPtr<IDXGIAdapter1> adapter;
   for (UINT i = 0; factory->EnumAdapters1(i, &adapter) != DXGI_ERROR_NOT_FOUND; i++)
   {
      DXGI_ADAPTER_DESC1 d;
      adapter->GetDesc1(&d);
      if (memcmp(&d.AdapterLuid, &req.adapterLuid, sizeof(LUID)) == 0)
         break;
      adapter.Reset();
   }
   if (!adapter)
   {
      say("erreur carte graphique du casque introuvable");
      return 4;
   }
   ComPtr<ID3D11Device> device;
   ComPtr<ID3D11DeviceContext> context;
   const D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0 };
   if (FAILED(D3D11CreateDevice(adapter.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 2, D3D11_SDK_VERSION, &device, nullptr, &context)))
   {
      say("erreur Direct3D 11 indisponible");
      return 4;
   }

   // Écrans de cette carte, et pour chaque panneau celui qui le contient.
   std::vector<Output> outputs;
   {
      ComPtr<IDXGIOutput> o;
      for (UINT i = 0; adapter->EnumOutputs(i, &o) != DXGI_ERROR_NOT_FOUND; i++)
      {
         Output out;
         DXGI_OUTPUT_DESC d;
         o->GetDesc(&d);
         o.As(&out.output);
         out.desktop = d.DesktopCoordinates;
         if (d.Rotation != DXGI_MODE_ROTATION_IDENTITY && d.Rotation != DXGI_MODE_ROTATION_UNSPECIFIED)
            say("erreur écran tourné dans Windows non pris en charge, laissé noir");
         else
            outputs.push_back(out);
         o.Reset();
      }
   }
   for (Panel& p : panels)
   {
      for (size_t i = 0; i < outputs.size(); i++)
         if (contains(outputs[i].desktop, p.source))
         {
            p.output = static_cast<int>(i);
            p.inOutput = { p.source.left - outputs[i].desktop.left, p.source.top - outputs[i].desktop.top, p.source.right - outputs[i].desktop.left,
               p.source.bottom - outputs[i].desktop.top };
         }
      if (p.output < 0)
         say("erreur " + p.role + " : écran introuvable sur la carte du casque, panneau noir");
   }

   XrGraphicsBindingD3D11KHR binding { XR_TYPE_GRAPHICS_BINDING_D3D11_KHR };
   binding.device = device.Get();
   XrSessionCreateInfo sci { XR_TYPE_SESSION_CREATE_INFO };
   sci.next = &binding;
   sci.systemId = system;
   XrSession session = XR_NULL_HANDLE;
   if (XR_FAILED(xrCreateSession_(instance, &sci, &session)))
   {
      say("casque-absent session refusée par le runtime");
      xrDestroyInstance_(instance);
      return 3;
   }

   // Espace de base : la pièce (sol à y = 0) si le runtime la connaît, sinon l'espace local.
   bool stage = false;
   {
      uint32_t n = 0;
      xrEnumerateReferenceSpaces_(session, 0, &n, nullptr);
      std::vector<XrReferenceSpaceType> types(n);
      xrEnumerateReferenceSpaces_(session, n, &n, types.data());
      for (auto t : types)
         stage |= t == XR_REFERENCE_SPACE_TYPE_STAGE;
   }
   XrReferenceSpaceCreateInfo rsci { XR_TYPE_REFERENCE_SPACE_CREATE_INFO };
   rsci.poseInReferenceSpace = { { 0, 0, 0, 1 }, { 0, 0, 0 } };
   rsci.referenceSpaceType = stage ? XR_REFERENCE_SPACE_TYPE_STAGE : XR_REFERENCE_SPACE_TYPE_LOCAL;
   XrSpace base = XR_NULL_HANDLE, view = XR_NULL_HANDLE;
   xrCreateReferenceSpace_(session, &rsci, &base);
   rsci.referenceSpaceType = XR_REFERENCE_SPACE_TYPE_VIEW;
   xrCreateReferenceSpace_(session, &rsci, &view);

   // Manettes du Quest (Touch) : les boutons du menu, comme ceux de la borne. Gâchettes : flippers ;
   // A : Start ; B : Exit ; poignées : MagnaSave. Cyber Pinball reçoit « bouton <nom> 1|0 » à chaque
   // changement, seulement tant que le menu a le regard du joueur (« FOCUSED ») ; le reste du temps,
   // le runtime les rend inactives, et un bouton resté appuyé est relâché.
   struct Control
   {
      const char* name;
      const char* label;
      const char* binding;
      XrAction action = XR_NULL_HANDLE;
      bool down = false;
   };
   Control controls[] = {
      { "batteur-gauche", "Flipper gauche", "/user/hand/left/input/trigger/value" },
      { "batteur-droit", "Flipper droit", "/user/hand/right/input/trigger/value" },
      { "start", "Start", "/user/hand/right/input/a/click" },
      { "exit", "Exit", "/user/hand/right/input/b/click" },
      { "magnasave-gauche", "MagnaSave gauche", "/user/hand/left/input/squeeze/value" },
      { "magnasave-droit", "MagnaSave droit", "/user/hand/right/input/squeeze/value" },
   };
   // Bout de chaque manette (pose de visée) : les points touchés du calage et leurs repères.
   const char* aimNames[2] = { "visee-gauche", "visee-droite" };
   const char* aimBindings[2] = { "/user/hand/left/input/aim/pose", "/user/hand/right/input/aim/pose" };
   XrAction aimActions[2] = { XR_NULL_HANDLE, XR_NULL_HANDLE };
   XrSpace aimSpaces[2] = { XR_NULL_HANDLE, XR_NULL_HANDLE };
   XrActionSet actionSet = XR_NULL_HANDLE;
   bool controllers = false;
   {
      XrActionSetCreateInfo asci { XR_TYPE_ACTION_SET_CREATE_INFO };
      strcpy_s(asci.actionSetName, "cyberpinball");
      strcpy_s(asci.localizedActionSetName, "Cyber Pinball");
      if (XR_SUCCEEDED(xrCreateActionSet_(instance, &asci, &actionSet)))
      {
         std::vector<XrActionSuggestedBinding> suggested;
         for (int h = 0; h < 2; h++)
         {
            XrActionCreateInfo aci { XR_TYPE_ACTION_CREATE_INFO };
            aci.actionType = XR_ACTION_TYPE_POSE_INPUT;
            strcpy_s(aci.actionName, aimNames[h]);
            strcpy_s(aci.localizedActionName, h ? "Visée droite" : "Visée gauche");
            XrPath path = XR_NULL_PATH;
            if (XR_SUCCEEDED(xrCreateAction_(actionSet, &aci, &aimActions[h])) && XR_SUCCEEDED(xrStringToPath_(instance, aimBindings[h], &path)))
               suggested.push_back({ aimActions[h], path });
         }
         for (Control& c : controls)
         {
            XrActionCreateInfo aci { XR_TYPE_ACTION_CREATE_INFO };
            aci.actionType = XR_ACTION_TYPE_BOOLEAN_INPUT;
            strcpy_s(aci.actionName, c.name);
            strcpy_s(aci.localizedActionName, c.label);
            XrPath path = XR_NULL_PATH;
            if (XR_SUCCEEDED(xrCreateAction_(actionSet, &aci, &c.action)) && XR_SUCCEEDED(xrStringToPath_(instance, c.binding, &path)))
               suggested.push_back({ c.action, path });
         }
         XrPath profile = XR_NULL_PATH;
         xrStringToPath_(instance, "/interaction_profiles/oculus/touch_controller", &profile);
         XrInteractionProfileSuggestedBinding ipsb { XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING };
         ipsb.interactionProfile = profile;
         ipsb.countSuggestedBindings = static_cast<uint32_t>(suggested.size());
         ipsb.suggestedBindings = suggested.data();
         XrSessionActionSetsAttachInfo attach { XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO };
         attach.countActionSets = 1;
         attach.actionSets = &actionSet;
         controllers = suggested.size() == std::size(controls) + 2 && XR_SUCCEEDED(xrSuggestInteractionProfileBindings_(instance, &ipsb))
            && XR_SUCCEEDED(xrAttachSessionActionSets_(session, &attach));
         for (int h = 0; controllers && h < 2; h++)
         {
            XrActionSpaceCreateInfo aimSpaceInfo { XR_TYPE_ACTION_SPACE_CREATE_INFO };
            aimSpaceInfo.action = aimActions[h];
            aimSpaceInfo.poseInActionSpace = { { 0, 0, 0, 1 }, { 0, 0, 0 } };
            xrCreateActionSpace_(session, &aimSpaceInfo, &aimSpaces[h]);
         }
      }
      if (!controllers)
         say("erreur manettes indisponibles");
   }
   auto releaseControls = [&]()
   {
      for (Control& c : controls)
         if (c.down)
         {
            c.down = false;
            say(std::string("bouton ") + c.name + " 0");
         }
   };

   // Format des images : sRGB pour que le casque montre les couleurs de l'écran (copie brute des octets).
   DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
   {
      uint32_t n = 0;
      xrEnumerateSwapchainFormats_(session, 0, &n, nullptr);
      std::vector<int64_t> formats(n);
      xrEnumerateSwapchainFormats_(session, n, &n, formats.data());
      for (DXGI_FORMAT wanted : { DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_B8G8R8A8_UNORM })
         for (int64_t f : formats)
            if (format == DXGI_FORMAT_UNKNOWN && f == wanted)
               format = wanted;
   }
   if (format == DXGI_FORMAT_UNKNOWN)
   {
      say("erreur aucun format d'image BGRA chez le runtime");
      return 4;
   }
   // Image d'un panneau dans le casque, à la taille donnée.
   auto createPanelImage = [&](Panel& p, UINT width, UINT height) {
      XrSwapchainCreateInfo ci { XR_TYPE_SWAPCHAIN_CREATE_INFO };
      ci.usageFlags = XR_SWAPCHAIN_USAGE_TRANSFER_DST_BIT | XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT | XR_SWAPCHAIN_USAGE_SAMPLED_BIT;
      ci.format = format;
      ci.sampleCount = 1;
      ci.width = width;
      ci.height = height;
      ci.faceCount = 1;
      ci.arraySize = 1;
      ci.mipCount = 1;
      if (XR_FAILED(xrCreateSwapchain_(session, &ci, &p.swapchain)))
      {
         say("erreur " + p.role + " : image du casque refusée");
         return;
      }
      p.width = width, p.height = height;
      uint32_t n = 0;
      xrEnumerateSwapchainImages_(p.swapchain, 0, &n, nullptr);
      p.images.assign(n, { XR_TYPE_SWAPCHAIN_IMAGE_D3D11_KHR });
      xrEnumerateSwapchainImages_(p.swapchain, n, &n, reinterpret_cast<XrSwapchainImageBaseHeader*>(p.images.data()));
   };
   // Panneaux dupliqués : leur image tout de suite ; panneaux à surface : à la première image reçue.
   for (Panel& p : panels)
      if (p.surface.empty())
         createPanelImage(p, static_cast<UINT>(p.source.right - p.source.left), static_cast<UINT>(p.source.bottom - p.source.top));

   // Couche de projection : la borne en volume, un rendu par œil, sous les panneaux.
   struct Eye
   {
      XrSwapchain swapchain = XR_NULL_HANDLE;
      std::vector<XrSwapchainImageD3D11KHR> images;
      std::vector<ComPtr<ID3D11RenderTargetView>> targets;
      ComPtr<ID3D11DepthStencilView> depth;
      uint32_t width = 0, height = 0;
   };
   Eye eyes[2];
   scene::Renderer renderer;
   /** Repères des manettes pendant le calage, dans l'espace de la pièce (refaits à chaque image). */
   scene::Renderer pointers;
   /** Les écrans dessinés dans la couche de projection, avec la profondeur. */
   scene::ImageRenderer imageRenderer;
   std::vector<std::string> pointerLines;
   ULONGLONG gripsSince = 0;
   bool gestureSent = false;
   bool projection = false;
   {
      uint32_t n = 0;
      xrEnumerateViewConfigurationViews_(instance, system, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, 0, &n, nullptr);
      std::vector<XrViewConfigurationView> vcv(n, { XR_TYPE_VIEW_CONFIGURATION_VIEW });
      xrEnumerateViewConfigurationViews_(instance, system, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, n, &n, vcv.data());
      std::string error;
      projection = n == 2 && renderer.init(device.Get(), error) && pointers.init(device.Get(), error) && imageRenderer.init(device.Get(), error);
      if (!projection)
         say("erreur scène indisponible : " + (error.empty() ? std::string("vues du casque") : error));
      for (uint32_t e = 0; projection && e < 2; e++)
      {
         Eye& eye = eyes[e];
         eye.width = vcv[e].recommendedImageRectWidth;
         eye.height = vcv[e].recommendedImageRectHeight;
         XrSwapchainCreateInfo ci { XR_TYPE_SWAPCHAIN_CREATE_INFO };
         ci.usageFlags = XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT;
         ci.format = format;
         ci.sampleCount = 1;
         ci.width = eye.width;
         ci.height = eye.height;
         ci.faceCount = 1;
         ci.arraySize = 1;
         ci.mipCount = 1;
         if (XR_FAILED(xrCreateSwapchain_(session, &ci, &eye.swapchain)))
         {
            say("erreur scène : image d'un œil refusée");
            projection = false;
            break;
         }
         uint32_t count = 0;
         xrEnumerateSwapchainImages_(eye.swapchain, 0, &count, nullptr);
         eye.images.assign(count, { XR_TYPE_SWAPCHAIN_IMAGE_D3D11_KHR });
         xrEnumerateSwapchainImages_(eye.swapchain, count, &count, reinterpret_cast<XrSwapchainImageBaseHeader*>(eye.images.data()));
         for (auto& img : eye.images)
         {
            D3D11_RENDER_TARGET_VIEW_DESC rtv {};
            rtv.Format = format;
            rtv.ViewDimension = D3D11_RTV_DIMENSION_TEXTURE2D;
            ComPtr<ID3D11RenderTargetView> target;
            device->CreateRenderTargetView(img.texture, &rtv, &target);
            eye.targets.push_back(target);
         }
         D3D11_TEXTURE2D_DESC dd {};
         dd.Width = eye.width;
         dd.Height = eye.height;
         dd.MipLevels = 1;
         dd.ArraySize = 1;
         dd.Format = DXGI_FORMAT_D32_FLOAT;
         dd.SampleDesc.Count = 1;
         dd.Usage = D3D11_USAGE_DEFAULT;
         dd.BindFlags = D3D11_BIND_DEPTH_STENCIL;
         ComPtr<ID3D11Texture2D> depthTexture;
         device->CreateTexture2D(&dd, nullptr, &depthTexture);
         if (depthTexture)
            device->CreateDepthStencilView(depthTexture.Get(), nullptr, &eye.depth);
         if (!eye.depth)
            projection = false;
      }
   }

   say(std::string("pret ") + props.runtimeName + (stage ? " (pièce)" : " (local)") + (colorScale ? "" : " (sans fondu des panneaux)"));

   // Surfaces rendues hors écran par Cyber Pinball : les textures d'Electron ouvertes (par ressource),
   // et la copie de la dernière image, d'où les panneaux prennent la leur.
   struct Surface
   {
      ComPtr<ID3D11Texture2D> copy;
      ComPtr<ID3D11ShaderResourceView> view; // la copie, à dessiner dans la couche de projection
      UINT width = 0, height = 0;
      uint64_t generation = 0;
   };
   std::map<std::string, Surface> surfaces;
   bool worn = false;

   XrPosef anchor { { 0, 0, 0, 1 }, { 0, 0, -0.f } };
   bool running = false, exitRequested = false, done = false;
   // Fondu au noir avant de rendre le casque : 300 ms (250 à 350 ms dans la direction artistique).
   constexpr ULONGLONG FADE_MS = 300;
   ULONGLONG fadeStart = 0;
   float fade = 1.f;
   XrSessionState state = XR_SESSION_STATE_UNKNOWN;
   while (!done)
   {
      XrEventDataBuffer ev { XR_TYPE_EVENT_DATA_BUFFER };
      while (xrPollEvent_(instance, &ev) == XR_SUCCESS)
      {
         if (ev.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED)
         {
            const XrSessionState previous = state;
            state = reinterpret_cast<XrEventDataSessionStateChanged*>(&ev)->state;
            say("etat " + std::to_string(static_cast<int>(state)));
            // Casque porté et regard à nous (« FOCUSED ») : le menu y est dessiné. Retiré, ou le menu
            // de Meta ouvert : plus rien dans le casque, et Cyber Pinball rend les écrans du PC.
            if ((state == XR_SESSION_STATE_FOCUSED) != worn)
            {
               worn = state == XR_SESSION_STATE_FOCUSED;
               say(std::string("porte ") + (worn ? "1" : "0"));
            }
            // La borne reste à sa place dans la pièce, comme un objet : ni la session qui reprend le
            // regard, ni le casque remis ne la déplacent (seuls « recentrer » et le recentrage du casque).
            // Relève : VPX a pris le regard du joueur (notre session n'est plus « FOCUSED ») : fondu, puis fin.
            if (handover && previous == XR_SESSION_STATE_FOCUSED && state != XR_SESSION_STATE_FOCUSED && !wantQuit)
            {
               say("releve VPX a pris le casque");
               wantQuit = true;
            }
            if (state == XR_SESSION_STATE_READY)
            {
               XrSessionBeginInfo bi { XR_TYPE_SESSION_BEGIN_INFO };
               bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
               running = XR_SUCCEEDED(xrBeginSession_(session, &bi));
            }
            else if (state == XR_SESSION_STATE_STOPPING)
            {
               xrEndSession_(session);
               running = false;
               if (exitRequested || handover)
                  done = true;
            }
            else if (state == XR_SESSION_STATE_EXITING || state == XR_SESSION_STATE_LOSS_PENDING)
               done = true;
         }
         else if (ev.type == XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING)
            done = true;
         else if (ev.type == XR_TYPE_EVENT_DATA_REFERENCE_SPACE_CHANGE_PENDING)
            wantRecenter = true; // recentrage demandé au casque (bouton Meta maintenu)
         ev = { XR_TYPE_EVENT_DATA_BUFFER };
      }
      // Relève sans suite (VPX n'a jamais pris le casque) : deux minutes au plus.
      if (handover && !wantQuit && GetTickCount64() - handoverAt > 120'000)
      {
         say("releve sans VPX dans le casque, fin");
         wantQuit = true;
      }
      if (wantQuit && !exitRequested)
      {
         if (!running)
         {
            exitRequested = true;
            done = true;
         }
         else
         {
            // La scène s'immobilise et fond au noir, puis la session se termine.
            if (!fadeStart)
               fadeStart = GetTickCount64();
            fade = 1.f - static_cast<float>(GetTickCount64() - fadeStart) / FADE_MS;
            if (fade <= 0.f)
            {
               fade = 0.f;
               exitRequested = true;
               xrRequestExitSession_(session);
            }
         }
      }
      if (done)
         break;

      {
         std::vector<IncomingImage> images;
         {
            std::lock_guard<std::mutex> lock(imagesMutex);
            images.swap(incoming);
         }
         // La dernière image de chaque surface est copiée ; les autres sont rendues tout de suite.
         std::map<std::string, size_t> latest;
         for (size_t i = 0; i < images.size(); i++)
            latest[images[i].surface] = i;
         for (size_t i = 0; i < images.size(); i++)
         {
            IncomingImage& img = images[i];
            Surface& surf = surfaces[img.surface];
            // Seule la dernière image d'une surface est ouverte ; les autres handles sont refermés.
            if (latest[img.surface] != i || fadeStart)
            {
               CloseHandle(reinterpret_cast<HANDLE>(img.handle));
               continue;
            }
            const ComPtr<ID3D11Texture2D> shared = openShared(device.Get(), reinterpret_cast<HANDLE>(img.handle));
            if (shared)
            {
               D3D11_TEXTURE2D_DESC td;
               shared->GetDesc(&td);
               if (!surf.copy || surf.width != td.Width || surf.height != td.Height)
               {
                  // Avec ses mipmaps, pour la couche de projection ; sinon une simple copie (panneaux « quad »).
                  if (!scene::makeImage(device.Get(), td.Width, td.Height, td.Format, surf.copy, surf.view))
                  {
                     D3D11_TEXTURE2D_DESC cd = td;
                     cd.Usage = D3D11_USAGE_DEFAULT;
                     cd.BindFlags = 0;
                     cd.CPUAccessFlags = 0;
                     cd.MiscFlags = 0;
                     device->CreateTexture2D(&cd, nullptr, &surf.copy);
                  }
                  surf.width = td.Width, surf.height = td.Height;
               }
               if (surf.copy)
               {
                  context->CopySubresourceRegion(surf.copy.Get(), 0, 0, 0, 0, shared.Get(), 0, nullptr);
                  if (surf.view)
                     context->GenerateMips(surf.view.Get());
                  surf.generation++;
               }
            }
         }
         if (!images.empty())
         {
            // Electron ne reprend ses textures qu'une fois la copie faite par le GPU.
            gpuFinish(device.Get(), context.Get());
            for (const IncomingImage& img : images)
               say("libre " + img.frame);
         }
      }

      if (!running)
      {
         Sleep(50);
         continue;
      }

      if (projection && sceneReady.exchange(false))
      {
         std::vector<std::string> lines;
         {
            std::lock_guard<std::mutex> lock(panelsMutex);
            lines = sceneLines;
         }
         std::vector<scene::Vertex> opaque, transparent;
         size_t bad = 0;
         for (const auto& l : lines)
            bad += scene::addPrimitive(l, opaque, transparent) ? 0 : 1;
         renderer.setScene(opaque, transparent);
         say("scene " + std::to_string(lines.size() - bad) + " formes" + (bad ? ", " + std::to_string(bad) + " illisibles" : ""));
      }

      XrFrameState fs { XR_TYPE_FRAME_STATE };
      if (XR_FAILED(xrWaitFrame_(session, nullptr, &fs)))
         break;
      xrBeginFrame_(session, nullptr);

      // Boutons des manettes : lus à chaque image, transmis à chaque changement.
      if (controllers && state == XR_SESSION_STATE_FOCUSED)
      {
         XrActiveActionSet active { actionSet, XR_NULL_PATH };
         XrActionsSyncInfo si { XR_TYPE_ACTIONS_SYNC_INFO };
         si.countActiveActionSets = 1;
         si.activeActionSets = &active;
         if (XR_SUCCEEDED(xrSyncActions_(session, &si)))
            for (Control& c : controls)
            {
               XrActionStateGetInfo gi { XR_TYPE_ACTION_STATE_GET_INFO };
               gi.action = c.action;
               XrActionStateBoolean st { XR_TYPE_ACTION_STATE_BOOLEAN };
               const bool down = XR_SUCCEEDED(xrGetActionStateBoolean_(session, &gi, &st)) && st.isActive && st.currentState;
               if (down != c.down)
               {
                  c.down = down;
                  say(std::string("bouton ") + c.name + (down ? " 1" : " 0"));
                  // Calage : gâchette appuyée, le bout de cette manette dans la pièce.
                  const int hand = std::string(c.name) == "batteur-gauche" ? 0 : std::string(c.name) == "batteur-droit" ? 1 : -1;
                  XrSpaceLocation loc { XR_TYPE_SPACE_LOCATION };
                  if (down && calibrating && hand >= 0 && aimSpaces[hand] != XR_NULL_HANDLE && XR_SUCCEEDED(xrLocateSpace_(aimSpaces[hand], base, fs.predictedDisplayTime, &loc))
                     && (loc.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT))
                     say(std::string("pointe ") + (hand ? "droite " : "gauche ") + std::to_string(loc.pose.position.x) + " " + std::to_string(loc.pose.position.y) + " "
                        + std::to_string(loc.pose.position.z) + (stage ? "" : " sans-piece"));
               }
            }
         // Les deux poignées tenues 3 s : Cyber Pinball ouvre le calage de la borne.
         const bool bothGrips = controls[4].down && controls[5].down;
         if (!bothGrips)
            gripsSince = 0, gestureSent = false;
         else if (!gripsSince)
            gripsSince = GetTickCount64();
         else if (!gestureSent && GetTickCount64() - gripsSince >= 3000)
         {
            gestureSent = true;
            say("geste caler");
         }
      }
      else
         releaseControls();

      // Repères des manettes pendant le calage : un petit cube vert au bout de chacune.
      pointerLines.clear();
      if (controllers && calibrating && state == XR_SESSION_STATE_FOCUSED)
         for (int h = 0; h < 2; h++)
         {
            XrSpaceLocation loc { XR_TYPE_SPACE_LOCATION };
            if (aimSpaces[h] != XR_NULL_HANDLE && XR_SUCCEEDED(xrLocateSpace_(aimSpaces[h], base, fs.predictedDisplayTime, &loc))
               && (loc.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT))
               pointerLines.push_back("boite " + std::to_string(loc.pose.position.x) + " " + std::to_string(loc.pose.position.y) + " " + std::to_string(loc.pose.position.z)
                  + " 0 0 0 1 0.025 0.025 0.025 #8be23aff #8be23aff");
         }
      if (projection && (!pointerLines.empty() || !pointers.empty()))
      {
         std::vector<scene::Vertex> opaque, transparent;
         for (const auto& l : pointerLines)
            scene::addPrimitive(l, opaque, transparent);
         pointers.setScene(opaque, transparent);
      }

      // Place gardée par Cyber Pinball (ancre) : la borne revient où elle était dans la pièce.
      if (anchorGiven.exchange(false))
      {
         std::lock_guard<std::mutex> lock(panelsMutex);
         anchor.orientation = { 0, std::sin(anchorYaw / 2), 0, std::cos(anchorYaw / 2) };
         anchor.position = { anchorX, anchorY, anchorZ };
         if (!stage)
            wantRecenter = true; // sans la pièce, l'ancre ne vaut pas d'une session à l'autre
      }
      // Recentrage : la borne devant le joueur, tournée comme son regard (lacet seulement). Seulement
      // sur une pose que le casque suit vraiment : posé ou pas encore porté, il ne rend qu'une pose
      // figée (trois recentrages identiques au millionième le 9 novembre 2026, borne dos au PC).
      if (wantRecenter)
      {
         XrSpaceLocation loc { XR_TYPE_SPACE_LOCATION };
         constexpr XrSpaceLocationFlags tracked = XR_SPACE_LOCATION_POSITION_VALID_BIT | XR_SPACE_LOCATION_ORIENTATION_VALID_BIT | XR_SPACE_LOCATION_POSITION_TRACKED_BIT
            | XR_SPACE_LOCATION_ORIENTATION_TRACKED_BIT;
         if (state == XR_SESSION_STATE_FOCUSED && XR_SUCCEEDED(xrLocateSpace_(view, base, fs.predictedDisplayTime, &loc)) && (loc.locationFlags & tracked) == tracked)
         {
            const XrVector3f fwd = rotate(loc.pose.orientation, { 0, 0, -1 });
            const float yaw = std::atan2(-fwd.x, -fwd.z);
            anchor.orientation = { 0, std::sin(yaw / 2), 0, std::cos(yaw / 2) };
            // Sans la pièce, le sol est supposé 1,60 m sous les yeux.
            anchor.position = { loc.pose.position.x, stage ? 0.f : loc.pose.position.y - 1.6f, loc.pose.position.z };
            wantRecenter = false;
            say("centre " + std::to_string(anchor.position.x) + " " + std::to_string(anchor.position.z) + " " + std::to_string(yaw) + " yeux=" + std::to_string(loc.pose.position.y - anchor.position.y)
               + (stage ? "" : " sans-piece"));
         }
      }

      // Nouvelles images des écrans (sauf pendant le fondu : l'ambiance s'immobilise ; ni casque retiré).
      for (size_t oi = 0; oi < outputs.size(); oi++)
      {
         Output& o = outputs[oi];
         if (fadeStart || !worn)
            break;
         // Écran dont tous les panneaux ont leur surface : rien à dupliquer.
         bool needed = false;
         for (const Panel& p : panels)
            needed |= p.output == static_cast<int>(oi) && p.surface.empty();
         if (!needed)
            continue;
         if (!o.dup && FAILED(o.output->DuplicateOutput(device.Get(), &o.dup)))
         {
            if (!o.reported)
               say("erreur duplication d'écran refusée");
            o.reported = true;
            continue;
         }
         DXGI_OUTDUPL_FRAME_INFO fi;
         ComPtr<IDXGIResource> res;
         const HRESULT hr = o.dup->AcquireNextFrame(0, &fi, &res);
         if (hr == DXGI_ERROR_ACCESS_LOST)
         {
            o.dup.Reset();
            continue;
         }
         if (FAILED(hr))
            continue;
         ComPtr<ID3D11Texture2D> tex;
         res.As(&tex);
         D3D11_TEXTURE2D_DESC d;
         tex->GetDesc(&d);
         if (!o.copy)
         {
            if (!scene::makeImage(device.Get(), d.Width, d.Height, d.Format, o.copy, o.view))
            {
               d.Usage = D3D11_USAGE_DEFAULT;
               d.BindFlags = 0;
               d.CPUAccessFlags = 0;
               d.MiscFlags = 0;
               device->CreateTexture2D(&d, nullptr, &o.copy);
            }
            o.width = d.Width, o.height = d.Height;
            o.format = d.Format;
            if (d.Format != DXGI_FORMAT_B8G8R8A8_UNORM && !o.reported)
            {
               say("erreur format d'écran " + std::to_string(static_cast<int>(d.Format)) + " non pris en charge (HDR ?)");
               o.reported = true;
            }
         }
         // Une image qui ne porte qu'un mouvement du pointeur (LastPresentTime nul) ne change rien à l'écran.
         if (o.copy && o.format == DXGI_FORMAT_B8G8R8A8_UNORM && (o.generation == 0 || fi.LastPresentTime.QuadPart != 0))
         {
            context->CopySubresourceRegion(o.copy.Get(), 0, 0, 0, 0, tex.Get(), 0, nullptr);
            if (o.view)
               context->GenerateMips(o.view.Get());
            o.generation++;
         }
         o.dup->ReleaseFrame();
      }

      // Instantané : l'image de chaque panneau, prise dans la copie de son écran, en BMP.
      if (wantSnapshot.exchange(false))
      {
         std::string dir;
         {
            std::lock_guard<std::mutex> lock(panelsMutex);
            dir = snapshotDir;
         }
         CreateDirectoryA(dir.c_str(), nullptr);
         for (const Panel& p : panels)
         {
            const Output* o = p.output >= 0 ? &outputs[p.output] : nullptr;
            if (!o || !o->copy || o->format != DXGI_FORMAT_B8G8R8A8_UNORM)
            {
               say("erreur instantane " + p.role + " : pas d'image");
               continue;
            }
            const UINT w = static_cast<UINT>(p.inOutput.right - p.inOutput.left), h = static_cast<UINT>(p.inOutput.bottom - p.inOutput.top);
            D3D11_TEXTURE2D_DESC sd {};
            sd.Width = w;
            sd.Height = h;
            sd.MipLevels = 1;
            sd.ArraySize = 1;
            sd.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
            sd.SampleDesc.Count = 1;
            sd.Usage = D3D11_USAGE_STAGING;
            sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
            ComPtr<ID3D11Texture2D> staging;
            if (FAILED(device->CreateTexture2D(&sd, nullptr, &staging)))
               continue;
            const D3D11_BOX box { static_cast<UINT>(p.inOutput.left), static_cast<UINT>(p.inOutput.top), 0, static_cast<UINT>(p.inOutput.right), static_cast<UINT>(p.inOutput.bottom), 1 };
            context->CopySubresourceRegion(staging.Get(), 0, 0, 0, 0, o->copy.Get(), 0, &box);
            D3D11_MAPPED_SUBRESOURCE m;
            if (SUCCEEDED(context->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &m)))
            {
               const std::string file = dir + "\\" + p.role + ".bmp";
               if (writeBmp(file, static_cast<const unsigned char*>(m.pData), m.RowPitch, w, h))
                  say("instantane " + file + " " + std::to_string(w) + "x" + std::to_string(h) + " pris dans [" + std::to_string(p.inOutput.left) + ","
                     + std::to_string(p.inOutput.top) + "] de l'écran");
               context->Unmap(staging.Get(), 0);
            }
         }
      }

      // Couche de projection : la scène, un rendu par œil, dans l'espace de la pièce.
      XrCompositionLayerProjection proj { XR_TYPE_COMPOSITION_LAYER_PROJECTION };
      XrCompositionLayerProjectionView projViews[2] { { XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW }, { XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW } };
      bool projected = false;
      if (fs.shouldRender && worn && projection)
      {
         XrViewLocateInfo vli { XR_TYPE_VIEW_LOCATE_INFO };
         vli.viewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
         vli.displayTime = fs.predictedDisplayTime;
         vli.space = base;
         XrViewState viewState { XR_TYPE_VIEW_STATE };
         XrView views[2] { { XR_TYPE_VIEW }, { XR_TYPE_VIEW } };
         uint32_t count = 0;
         if (XR_SUCCEEDED(xrLocateViews_(session, &vli, &viewState, 2, &count, views)) && count == 2
            && (viewState.viewStateFlags & XR_VIEW_STATE_POSITION_VALID_BIT) && (viewState.viewStateFlags & XR_VIEW_STATE_ORIENTATION_VALID_BIT))
         {
            const float aq[4] = { anchor.orientation.x, anchor.orientation.y, anchor.orientation.z, anchor.orientation.w };
            const float at[3] = { anchor.position.x, anchor.position.y, anchor.position.z };
            const scene::Mat4 world = scene::Mat4::pose(aq, at);
            projected = true;
            for (int e = 0; e < 2 && projected; e++)
            {
               Eye& eye = eyes[e];
               uint32_t index = 0;
               XrSwapchainImageAcquireInfo ai { XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO };
               if (XR_FAILED(xrAcquireSwapchainImage_(eye.swapchain, &ai, &index)))
               {
                  projected = false;
                  break;
               }
               XrSwapchainImageWaitInfo wi { XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO };
               wi.timeout = XR_INFINITE_DURATION;
               xrWaitSwapchainImage_(eye.swapchain, &wi);
               ID3D11RenderTargetView* target = eye.targets[index].Get();
               context->ClearRenderTargetView(target, scene::kVoid);
               context->ClearDepthStencilView(eye.depth.Get(), D3D11_CLEAR_DEPTH, 1.f, 0);
               context->OMSetRenderTargets(1, &target, eye.depth.Get());
               const D3D11_VIEWPORT viewport { 0, 0, static_cast<float>(eye.width), static_cast<float>(eye.height), 0, 1 };
               context->RSSetViewports(1, &viewport);
               const XrPosef& vp = views[e].pose;
               const float vq[4] = { vp.orientation.x, vp.orientation.y, vp.orientation.z, vp.orientation.w };
               const float vt[3] = { vp.position.x, vp.position.y, vp.position.z };
               const XrFovf& f = views[e].fov;
               const scene::Mat4 mvp = scene::Mat4::projection(f.angleLeft, f.angleRight, f.angleUp, f.angleDown, 0.05f, 50.f) * scene::Mat4::poseInverse(vq, vt) * world;
               // Avec l'extension, le runtime fond toutes les couches ; sinon la scène fond seule.
               renderer.draw(context.Get(), mvp, world, colorScale ? 1.f : fade);
               // Les écrans, dans la même couche et avec la profondeur : la scène passe devant ou
               // derrière comme dans la pièce (repères du calage, bout des manettes).
               for (Panel& p : panels)
               {
                  ID3D11ShaderResourceView* image = nullptr;
                  float uv[4] = { 0, 0, 1, 1 };
                  if (!p.surface.empty())
                  {
                     const auto it = surfaces.find(p.surface);
                     if (it != surfaces.end() && it->second.view)
                     {
                        image = it->second.view.Get();
                        uv[0] = p.fx, uv[1] = p.fy, uv[2] = p.fx + p.fw, uv[3] = p.fy + p.fh;
                     }
                  }
                  else if (p.output >= 0 && outputs[p.output].view && outputs[p.output].generation && outputs[p.output].width && outputs[p.output].height)
                  {
                     const Output& o = outputs[p.output];
                     image = o.view.Get();
                     uv[0] = static_cast<float>(p.inOutput.left) / o.width, uv[1] = static_cast<float>(p.inOutput.top) / o.height;
                     uv[2] = static_cast<float>(p.inOutput.right) / o.width, uv[3] = static_cast<float>(p.inOutput.bottom) / o.height;
                  }
                  if (!image)
                     continue;
                  const float hw = p.size.width / 2, hh = p.size.height / 2;
                  const XrVector3f local[4] = { { -hw, hh, 0 }, { hw, hh, 0 }, { -hw, -hh, 0 }, { hw, -hh, 0 } };
                  float corners[4][3];
                  for (int c = 0; c < 4; c++)
                  {
                     const XrVector3f r = rotate(p.pose.orientation, local[c]);
                     corners[c][0] = r.x + p.pose.position.x, corners[c][1] = r.y + p.pose.position.y, corners[c][2] = r.z + p.pose.position.z;
                  }
                  imageRenderer.draw(context.Get(), mvp, corners, uv, image, colorScale ? 1.f : fade);
                  if (e == 0 && !p.shown)
                  {
                     p.shown = true;
                     say("image " + p.role + (p.surface.empty() ? "" : " (rendu pour le casque)"));
                  }
               }
               if (!pointers.empty())
               {
                  const float iq[4] = { 0, 0, 0, 1 };
                  const float it[3] = { 0, 0, 0 };
                  const scene::Mat4 room = scene::Mat4::pose(iq, it);
                  const scene::Mat4 roomMvp = scene::Mat4::projection(f.angleLeft, f.angleRight, f.angleUp, f.angleDown, 0.05f, 50.f) * scene::Mat4::poseInverse(vq, vt);
                  pointers.draw(context.Get(), roomMvp, room, colorScale ? 1.f : fade);
               }
               context->OMSetRenderTargets(0, nullptr, nullptr);
               XrSwapchainImageReleaseInfo ri { XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO };
               xrReleaseSwapchainImage_(eye.swapchain, &ri);
               projViews[e].pose = vp;
               projViews[e].fov = f;
               projViews[e].subImage.swapchain = eye.swapchain;
               projViews[e].subImage.imageRect = { { 0, 0 }, { static_cast<int32_t>(eye.width), static_cast<int32_t>(eye.height) } };
            }
         }
      }
      // Fondu au noir de toutes les couches, quand le runtime le permet.
      XrCompositionLayerColorScaleBiasKHR scale { XR_TYPE_COMPOSITION_LAYER_COLOR_SCALE_BIAS_KHR };
      scale.colorScale = { fade, fade, fade, 1.f };
      scale.colorBias = { 0, 0, 0, 0 };
      const void* fadeNext = colorScale && fade < 1.f ? &scale : nullptr;

      std::vector<XrCompositionLayerQuad> quads;
      // Sans couche de projection (Direct3D l'a refusée) : les écrans en couches « quad », toujours devant.
      if (fs.shouldRender && worn && !projection)
      {
         for (Panel& p : panels)
         {
            // Panneau à surface (fenêtre de Cyber Pinball rendue pour le casque) : sa dernière image,
            // son rectangle pris en fractions dans la texture reçue (sa taille réelle).
            if (!p.surface.empty())
            {
               auto it = surfaces.find(p.surface);
               if (it != surfaces.end() && it->second.copy && p.swapchain == XR_NULL_HANDLE)
               {
                  const UINT w = std::max(1u, static_cast<UINT>(std::lround(p.fw * it->second.width)));
                  const UINT h = std::max(1u, static_cast<UINT>(std::lround(p.fh * it->second.height)));
                  createPanelImage(p, w, h);
               }
               if (it != surfaces.end() && it->second.copy && p.swapchain != XR_NULL_HANDLE && it->second.generation != p.copied)
               {
                  const Surface& surf = it->second;
                  uint32_t index = 0;
                  XrSwapchainImageAcquireInfo ai { XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO };
                  if (XR_SUCCEEDED(xrAcquireSwapchainImage_(p.swapchain, &ai, &index)))
                  {
                     XrSwapchainImageWaitInfo wi { XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO };
                     wi.timeout = XR_INFINITE_DURATION;
                     xrWaitSwapchainImage_(p.swapchain, &wi);
                     const UINT w = p.width, h = p.height;
                     const UINT left = std::min<UINT>(static_cast<UINT>(std::lround(p.fx * surf.width)), surf.width), top = std::min<UINT>(static_cast<UINT>(std::lround(p.fy * surf.height)), surf.height);
                     const D3D11_BOX box { left, top, 0, std::min(left + w, surf.width), std::min(top + h, surf.height), 1 };
                     if (box.right > box.left && box.bottom > box.top)
                        context->CopySubresourceRegion(p.images[index].texture, 0, 0, 0, 0, surf.copy.Get(), 0, &box);
                     XrSwapchainImageReleaseInfo ri { XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO };
                     xrReleaseSwapchainImage_(p.swapchain, &ri);
                     p.copied = surf.generation;
                     if (!p.shown)
                     {
                        p.shown = true;
                        say("image " + p.role + " (rendu pour le casque)");
                     }
                  }
               }
            }
            const Output* o = p.output >= 0 && p.surface.empty() ? &outputs[p.output] : nullptr;
            if (o && o->copy && o->format == DXGI_FORMAT_B8G8R8A8_UNORM && o->generation != p.copied)
            {
               uint32_t index = 0;
               XrSwapchainImageAcquireInfo ai { XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO };
               if (XR_FAILED(xrAcquireSwapchainImage_(p.swapchain, &ai, &index)))
                  continue;
               XrSwapchainImageWaitInfo wi { XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO };
               wi.timeout = XR_INFINITE_DURATION;
               xrWaitSwapchainImage_(p.swapchain, &wi);
               const D3D11_BOX box { static_cast<UINT>(p.inOutput.left), static_cast<UINT>(p.inOutput.top), 0, static_cast<UINT>(p.inOutput.right),
                  static_cast<UINT>(p.inOutput.bottom), 1 };
               context->CopySubresourceRegion(p.images[index].texture, 0, 0, 0, 0, o->copy.Get(), 0, &box);
               XrSwapchainImageReleaseInfo ri { XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO };
               xrReleaseSwapchainImage_(p.swapchain, &ri);
               p.copied = o->generation;
               if (!p.shown)
               {
                  p.shown = true;
                  say("image " + p.role);
               }
            }
            // Rien encore de rendu au runtime : pas de panneau (il serait vide).
            if (!p.shown || p.swapchain == XR_NULL_HANDLE)
               continue;

            XrCompositionLayerQuad q { XR_TYPE_COMPOSITION_LAYER_QUAD };
            q.next = fadeNext;
            q.space = base;
            q.eyeVisibility = XR_EYE_VISIBILITY_BOTH;
            q.subImage.swapchain = p.swapchain;
            q.subImage.imageRect = { { 0, 0 }, { static_cast<int32_t>(p.width), static_cast<int32_t>(p.height) } };
            q.pose = compose(anchor, p.pose);
            q.size = p.size;
            quads.push_back(q);
         }
      }
      std::vector<const XrCompositionLayerBaseHeader*> layers;
      if (projected)
      {
         proj.next = fadeNext;
         proj.space = base;
         proj.viewCount = 2;
         proj.views = projViews;
         layers.push_back(reinterpret_cast<const XrCompositionLayerBaseHeader*>(&proj));
      }
      for (const auto& q : quads)
         layers.push_back(reinterpret_cast<const XrCompositionLayerBaseHeader*>(&q));
      XrFrameEndInfo fe { XR_TYPE_FRAME_END_INFO };
      fe.displayTime = fs.predictedDisplayTime;
      fe.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
      fe.layerCount = static_cast<uint32_t>(layers.size());
      fe.layers = layers.data();
      if (const XrResult r = xrEndFrame_(session, &fe); XR_FAILED(r))
         say("erreur xrEndFrame " + hex(r));
   }

   for (Panel& p : panels)
      if (p.swapchain)
         xrDestroySwapchain_(p.swapchain);
   for (Eye& eye : eyes)
      if (eye.swapchain)
         xrDestroySwapchain_(eye.swapchain);
   if (view)
      xrDestroySpace_(view);
   if (base)
      xrDestroySpace_(base);
   xrDestroySession_(session);
   xrDestroyInstance_(instance);
   say("fini");
   return 0;
}
