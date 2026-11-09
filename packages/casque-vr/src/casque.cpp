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
//     recentrer          (la borne revient devant le joueur)
//     quitter            (fin propre de la session : avant une partie de VPX)
//   Sortie standard :
//     pret <runtime> | casque-absent <raison> | erreur <texte> | etat <état OpenXR> | centre | fini

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_D3D11
#define XR_NO_PROTOTYPES
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <atomic>
#include <cmath>
#include <cstdio>
#include <iostream>
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
   X(xrAcquireSwapchainImage) X(xrWaitSwapchainImage) X(xrReleaseSwapchainImage) X(xrResultToString)
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
};

struct Output
{
   ComPtr<IDXGIOutput1> output;
   RECT desktop {};
   ComPtr<IDXGIOutputDuplication> dup;
   ComPtr<ID3D11Texture2D> copy; // dernière image reçue
   DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
   bool reported = false;
};

std::atomic<bool> wantRecenter { true };
std::atomic<bool> wantQuit { false };
std::atomic<bool> described { false };
std::mutex panelsMutex;
std::vector<Panel> pending;

void readCommands()
{
   std::string line;
   while (std::getline(std::cin, line))
   {
      std::istringstream in(line);
      std::string word;
      in >> word;
      if (word == "panneau" && !described)
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

} // namespace

int main(int argc, char** argv)
{
   std::string loaderPath;
   for (int i = 1; i + 1 < argc; i++)
      if (std::string(argv[i]) == "--chargeur")
         loaderPath = argv[i + 1];
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
   }
   if (wantQuit || panels.empty())
   {
      say("erreur aucun écran à montrer");
      return 2;
   }

   const char* extensions[] = { XR_KHR_D3D11_ENABLE_EXTENSION_NAME };
   XrInstanceCreateInfo ici { XR_TYPE_INSTANCE_CREATE_INFO };
   std::snprintf(ici.applicationInfo.applicationName, XR_MAX_APPLICATION_NAME_SIZE, "Cyber Pinball");
   ici.applicationInfo.applicationVersion = 1;
   std::snprintf(ici.applicationInfo.engineName, XR_MAX_ENGINE_NAME_SIZE, "Cyber Pinball");
   ici.applicationInfo.apiVersion = XR_API_VERSION_1_0;
   ici.enabledExtensionCount = 1;
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
   for (Panel& p : panels)
   {
      XrSwapchainCreateInfo ci { XR_TYPE_SWAPCHAIN_CREATE_INFO };
      ci.usageFlags = XR_SWAPCHAIN_USAGE_TRANSFER_DST_BIT | XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT | XR_SWAPCHAIN_USAGE_SAMPLED_BIT;
      ci.format = format;
      ci.sampleCount = 1;
      ci.width = static_cast<uint32_t>(p.source.right - p.source.left);
      ci.height = static_cast<uint32_t>(p.source.bottom - p.source.top);
      ci.faceCount = 1;
      ci.arraySize = 1;
      ci.mipCount = 1;
      if (XR_FAILED(xrCreateSwapchain_(session, &ci, &p.swapchain)))
      {
         say("erreur " + p.role + " : image du casque refusée");
         continue;
      }
      uint32_t n = 0;
      xrEnumerateSwapchainImages_(p.swapchain, 0, &n, nullptr);
      p.images.assign(n, { XR_TYPE_SWAPCHAIN_IMAGE_D3D11_KHR });
      xrEnumerateSwapchainImages_(p.swapchain, n, &n, reinterpret_cast<XrSwapchainImageBaseHeader*>(p.images.data()));
   }

   say(std::string("pret ") + props.runtimeName + (stage ? " (pièce)" : " (local)"));

   XrPosef anchor { { 0, 0, 0, 1 }, { 0, 0, -0.f } };
   bool running = false, exitRequested = false, done = false;
   XrSessionState state = XR_SESSION_STATE_UNKNOWN;
   while (!done)
   {
      XrEventDataBuffer ev { XR_TYPE_EVENT_DATA_BUFFER };
      while (xrPollEvent_(instance, &ev) == XR_SUCCESS)
      {
         if (ev.type == XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED)
         {
            state = reinterpret_cast<XrEventDataSessionStateChanged*>(&ev)->state;
            say("etat " + std::to_string(static_cast<int>(state)));
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
               if (exitRequested)
                  done = true;
            }
            else if (state == XR_SESSION_STATE_EXITING || state == XR_SESSION_STATE_LOSS_PENDING)
               done = true;
         }
         else if (ev.type == XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING)
            done = true;
         ev = { XR_TYPE_EVENT_DATA_BUFFER };
      }
      if (wantQuit && !exitRequested)
      {
         exitRequested = true;
         if (running)
            xrRequestExitSession_(session);
         else
            done = true;
      }
      if (done)
         break;
      if (!running)
      {
         Sleep(50);
         continue;
      }

      XrFrameState fs { XR_TYPE_FRAME_STATE };
      if (XR_FAILED(xrWaitFrame_(session, nullptr, &fs)))
         break;
      xrBeginFrame_(session, nullptr);

      // Recentrage : la borne devant le joueur, tournée comme son regard (lacet seulement).
      if (wantRecenter)
      {
         XrSpaceLocation loc { XR_TYPE_SPACE_LOCATION };
         if (XR_SUCCEEDED(xrLocateSpace_(view, base, fs.predictedDisplayTime, &loc))
            && (loc.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) && (loc.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT))
         {
            const XrVector3f fwd = rotate(loc.pose.orientation, { 0, 0, -1 });
            const float yaw = std::atan2(-fwd.x, -fwd.z);
            anchor.orientation = { 0, std::sin(yaw / 2), 0, std::cos(yaw / 2) };
            // Sans la pièce, le sol est supposé 1,60 m sous les yeux.
            anchor.position = { loc.pose.position.x, stage ? 0.f : loc.pose.position.y - 1.6f, loc.pose.position.z };
            wantRecenter = false;
            say("centre");
         }
      }

      // Nouvelles images des écrans.
      for (Output& o : outputs)
      {
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
            d.Usage = D3D11_USAGE_DEFAULT;
            d.BindFlags = 0;
            d.CPUAccessFlags = 0;
            d.MiscFlags = 0;
            device->CreateTexture2D(&d, nullptr, &o.copy);
            o.format = d.Format;
            if (d.Format != DXGI_FORMAT_B8G8R8A8_UNORM && !o.reported)
            {
               say("erreur format d'écran " + std::to_string(static_cast<int>(d.Format)) + " non pris en charge (HDR ?)");
               o.reported = true;
            }
         }
         if (o.copy && o.format == DXGI_FORMAT_B8G8R8A8_UNORM)
            context->CopyResource(o.copy.Get(), tex.Get());
         o.dup->ReleaseFrame();
      }

      std::vector<XrCompositionLayerQuad> quads;
      if (fs.shouldRender)
      {
         for (Panel& p : panels)
         {
            if (p.swapchain == XR_NULL_HANDLE)
               continue;
            uint32_t index = 0;
            XrSwapchainImageAcquireInfo ai { XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO };
            if (XR_FAILED(xrAcquireSwapchainImage_(p.swapchain, &ai, &index)))
               continue;
            XrSwapchainImageWaitInfo wi { XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO };
            wi.timeout = XR_INFINITE_DURATION;
            xrWaitSwapchainImage_(p.swapchain, &wi);
            ID3D11Texture2D* target = p.images[index].texture;
            const Output* o = p.output >= 0 ? &outputs[p.output] : nullptr;
            if (o && o->copy && o->format == DXGI_FORMAT_B8G8R8A8_UNORM)
            {
               const D3D11_BOX box { static_cast<UINT>(p.inOutput.left), static_cast<UINT>(p.inOutput.top), 0, static_cast<UINT>(p.inOutput.right),
                  static_cast<UINT>(p.inOutput.bottom), 1 };
               context->CopySubresourceRegion(target, 0, 0, 0, 0, o->copy.Get(), 0, &box);
            }
            XrSwapchainImageReleaseInfo ri { XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO };
            xrReleaseSwapchainImage_(p.swapchain, &ri);

            XrCompositionLayerQuad q { XR_TYPE_COMPOSITION_LAYER_QUAD };
            q.space = base;
            q.eyeVisibility = XR_EYE_VISIBILITY_BOTH;
            q.subImage.swapchain = p.swapchain;
            q.subImage.imageRect = { { 0, 0 }, { static_cast<int32_t>(p.source.right - p.source.left), static_cast<int32_t>(p.source.bottom - p.source.top) } };
            q.pose = compose(anchor, p.pose);
            q.size = p.size;
            quads.push_back(q);
         }
      }
      std::vector<const XrCompositionLayerBaseHeader*> layers;
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
   if (view)
      xrDestroySpace_(view);
   if (base)
      xrDestroySpace_(base);
   xrDestroySession_(session);
   xrDestroyInstance_(instance);
   say("fini");
   return 0;
}
