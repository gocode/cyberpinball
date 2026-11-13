#include "decor.h"

#include <d3dcompiler.h>
#include <wincodec.h>

#include <cmath>
#include <cstring>
#include <fstream>
#include <map>
#include <memory>
#include <variant>

using Microsoft::WRL::ComPtr;

namespace decor {

// ---------------------------------------------------------------------------
// Lecture du JSON d'un glb : le strict nécessaire (objets, tableaux, nombres, chaînes, booléens).

struct Json;
using JsonArray = std::vector<Json>;
using JsonObject = std::map<std::string, Json>;
struct Json
{
   std::variant<std::nullptr_t, bool, double, std::string, std::shared_ptr<JsonArray>, std::shared_ptr<JsonObject>> v = nullptr;
   const Json* get(const std::string& key) const
   {
      if (auto o = std::get_if<std::shared_ptr<JsonObject>>(&v))
      {
         auto it = (*o)->find(key);
         return it == (*o)->end() ? nullptr : &it->second;
      }
      return nullptr;
   }
   const JsonArray* array() const
   {
      auto a = std::get_if<std::shared_ptr<JsonArray>>(&v);
      return a ? a->get() : nullptr;
   }
   double number(double fallback = 0) const
   {
      auto d = std::get_if<double>(&v);
      return d ? *d : fallback;
   }
   std::string string() const
   {
      auto s = std::get_if<std::string>(&v);
      return s ? *s : std::string();
   }
   bool boolean(bool fallback = false) const
   {
      auto b = std::get_if<bool>(&v);
      return b ? *b : fallback;
   }
};

class JsonReader
{
 public:
   explicit JsonReader(const std::string& s) : m_s(s) { }
   bool parse(Json& out)
   {
      return value(out);
   }

 private:
   const std::string& m_s;
   size_t m_i = 0;
   void space()
   {
      while (m_i < m_s.size() && (m_s[m_i] == ' ' || m_s[m_i] == '\n' || m_s[m_i] == '\r' || m_s[m_i] == '\t'))
         m_i++;
   }
   bool str(std::string& out)
   {
      if (m_s[m_i] != '"')
         return false;
      m_i++;
      while (m_i < m_s.size() && m_s[m_i] != '"')
      {
         if (m_s[m_i] == '\\' && m_i + 1 < m_s.size())
         {
            m_i++;
            const char c = m_s[m_i];
            if (c == 'u' && m_i + 4 < m_s.size())
            {
               // Points de code ASCII seulement (les noms du décor le sont) ; les autres deviennent « ? ».
               const unsigned code = std::strtoul(m_s.substr(m_i + 1, 4).c_str(), nullptr, 16);
               out.push_back(code < 128 ? static_cast<char>(code) : '?');
               m_i += 4;
            }
            else
               out.push_back(c == 'n' ? '\n' : c == 't' ? '\t' : c);
         }
         else
            out.push_back(m_s[m_i]);
         m_i++;
      }
      m_i++;
      return true;
   }
   bool value(Json& out)
   {
      space();
      if (m_i >= m_s.size())
         return false;
      const char c = m_s[m_i];
      if (c == '{')
      {
         auto obj = std::make_shared<JsonObject>();
         m_i++;
         space();
         if (m_s[m_i] == '}')
            m_i++;
         else
            for (;;)
            {
               space();
               std::string key;
               if (!str(key))
                  return false;
               space();
               if (m_s[m_i++] != ':')
                  return false;
               Json v;
               if (!value(v))
                  return false;
               (*obj)[key] = std::move(v);
               space();
               if (m_s[m_i] == ',')
               {
                  m_i++;
                  continue;
               }
               if (m_s[m_i++] != '}')
                  return false;
               break;
            }
         out.v = obj;
         return true;
      }
      if (c == '[')
      {
         auto arr = std::make_shared<JsonArray>();
         m_i++;
         space();
         if (m_s[m_i] == ']')
            m_i++;
         else
            for (;;)
            {
               Json v;
               if (!value(v))
                  return false;
               arr->push_back(std::move(v));
               space();
               if (m_s[m_i] == ',')
               {
                  m_i++;
                  continue;
               }
               if (m_s[m_i++] != ']')
                  return false;
               break;
            }
         out.v = arr;
         return true;
      }
      if (c == '"')
      {
         std::string s;
         if (!str(s))
            return false;
         out.v = s;
         return true;
      }
      if (m_s.compare(m_i, 4, "true") == 0)
         return m_i += 4, out.v = true, true;
      if (m_s.compare(m_i, 5, "false") == 0)
         return m_i += 5, out.v = false, true;
      if (m_s.compare(m_i, 4, "null") == 0)
         return m_i += 4, out.v = nullptr, true;
      char* end = nullptr;
      const double d = std::strtod(m_s.c_str() + m_i, &end);
      if (end == m_s.c_str() + m_i)
         return false;
      m_i = end - m_s.c_str();
      out.v = d;
      return true;
   }
};

// ---------------------------------------------------------------------------
// Images (PNG, JPEG) décodées par WIC, en RGBA 8 bits.

static bool decodeImage(const uint8_t* bytes, size_t size, std::vector<uint8_t>& rgba, UINT& w, UINT& h)
{
   static bool comReady = SUCCEEDED(CoInitializeEx(nullptr, COINIT_MULTITHREADED)) || true;
   (void)comReady;
   ComPtr<IWICImagingFactory> factory;
   if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory))))
      return false;
   ComPtr<IWICStream> stream;
   if (FAILED(factory->CreateStream(&stream)) || FAILED(stream->InitializeFromMemory(const_cast<BYTE*>(bytes), static_cast<DWORD>(size))))
      return false;
   ComPtr<IWICBitmapDecoder> decoder;
   ComPtr<IWICBitmapFrameDecode> frame;
   ComPtr<IWICFormatConverter> converter;
   if (FAILED(factory->CreateDecoderFromStream(stream.Get(), nullptr, WICDecodeMetadataCacheOnDemand, &decoder)) || FAILED(decoder->GetFrame(0, &frame))
      || FAILED(factory->CreateFormatConverter(&converter))
      || FAILED(converter->Initialize(frame.Get(), GUID_WICPixelFormat32bppRGBA, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom)))
      return false;
   if (FAILED(converter->GetSize(&w, &h)) || !w || !h)
      return false;
   rgba.resize(static_cast<size_t>(w) * h * 4);
   return SUCCEEDED(converter->CopyPixels(nullptr, w * 4, static_cast<UINT>(rgba.size()), rgba.data()));
}

// ---------------------------------------------------------------------------
// Ciel : passages lointains.

Sky::Sky() : m_rng(20261112) { }

static void dirOf(float azDeg, float elDeg, float out[3])
{
   const float a = azDeg * 3.14159265f / 180, e = elDeg * 3.14159265f / 180;
   out[0] = -std::sin(a) * std::cos(e), out[1] = std::sin(e), out[2] = -std::cos(a) * std::cos(e);
}

Passage Sky::make(double t)
{
   std::uniform_real_distribution<float> u(0, 1);
   Passage p;
   const float pick = u(m_rng);
   p.kind = pick < 0.4f ? 4 : pick < 0.65f ? 1 : pick < 0.85f ? 2 : 3;
   const float side = u(m_rng) < 0.5f ? -1.f : 1.f;
   // Sur les côtés et en hauteur, loin du plateau et du fronton (devant, sous l'horizon).
   const float az = side * (50 + 55 * u(m_rng));
   const float el = p.kind == 1 ? 15 + 30 * u(m_rng) : 25 + 35 * u(m_rng);
   dirOf(az, el, p.start);
   // Mouvement surtout horizontal, toujours en s'éloignant de l'avant : l'axe est la verticale, un peu penchée.
   const float tilt = (u(m_rng) - 0.5f) * 0.6f;
   float axis[3] = { tilt, 1, tilt * 0.5f };
   const float n = std::sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
   for (int i = 0; i < 3; i++)
      p.axis[i] = axis[i] / n * side;
   const float deg = 3.14159265f / 180;
   switch (p.kind)
   {
   case 1: p.speed = (0.3f + 0.3f * u(m_rng)) * deg, p.duration = 24 + 12 * u(m_rng), p.trail = 0; break;
   case 2: p.speed = 0.4f * deg, p.duration = 24 + 10 * u(m_rng), p.trail = 0; break;
   case 3: p.speed = (0.15f + 0.15f * u(m_rng)) * deg, p.duration = 30 + 10 * u(m_rng), p.trail = 4 * deg; break;
   default: p.speed = (12 + 6 * u(m_rng)) * deg, p.duration = 0.7 + 0.4 * u(m_rng), p.trail = (3 + 2 * u(m_rng)) * deg; break;
   }
   p.t0 = t;
   return p;
}

void Sky::force(int kind, double t0)
{
   for (int i = 0; i < 50; i++)
   {
      Passage p = make(t0);
      if (p.kind == kind)
      {
         m_live.push_back(p);
         m_next = t0 + 1e6;
         return;
      }
   }
}

void Sky::update(double t, Passage out[2])
{
   std::uniform_real_distribution<double> u(25, 45);
   if (m_next < 0)
      m_next = t + 8; // un premier passage peu après l'arrivée
   std::erase_if(m_live, [t](const Passage& p) { return t > p.t0 + p.duration; });
   if (t >= m_next)
   {
      if (m_live.size() < 2)
         m_live.push_back(make(t));
      m_next = t + u(m_rng);
   }
   for (int i = 0; i < 2; i++)
      out[i] = i < static_cast<int>(m_live.size()) ? m_live[i] : Passage {};
}

// ---------------------------------------------------------------------------
// Rendu.

static const char* kShader = R"(
cbuffer Frame : register(b0)
{
   row_major float4x4 mvp;
   row_major float4x4 skyMvp;
   float4 tint;      // linéaire
   float4 flags;     // x : texture, y : tonalité, z : teinte, w : fondu
   float4 extra;     // x : opacité, y : temps (s)
   float4 evA[2];    // départ xyz, nature
   float4 evB[2];    // axe xyz, vitesse (rad/s)
   float4 evC[2];    // écoulé, durée, traînée (rad)
};
Texture2D tex : register(t0);
SamplerState smp : register(s0);
struct VI { float3 p : POSITION; float2 uv : TEXCOORD; float4 c : COLOR; };
struct VO { float4 p : SV_POSITION; float2 uv : TEXCOORD; float4 c : COLOR; float3 d : DIRECTION; };

// Tonalité ACES filmique de three.js r128, exposition de la maquette (1,15).
float3 aces(float3 c)
{
   c *= 1.15 / 0.6;
   float3x3 inM = float3x3(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
   float3x3 outM = float3x3(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
   c = mul(inM, c);
   c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.432951) + 0.238081);
   return saturate(mul(outM, c));
}

VO vs(VI i)
{
   VO o;
   o.p = mul(mvp, float4(i.p, 1));
   o.uv = i.uv;
   o.c = i.c;
   o.d = i.p;
   return o;
}
float4 ps(VO i) : SV_TARGET
{
   float4 t = flags.x > 0.5 ? tex.Sample(smp, i.uv) : float4(1, 1, 1, 1);
   float3 col = i.c.rgb * t.rgb;
   if (flags.z > 0.5) col *= tint.rgb;
   if (flags.y > 0.5) col = aces(col);
   return float4(col * flags.w, t.a * extra.x);
}

// --- Ciel à l'infini : sans translation, au fond de la profondeur.
VO skyVs(VI i)
{
   VO o;
   o.p = mul(skyMvp, float4(i.p, 0));
   o.p.z = o.p.w; // profondeur 1 : derrière tout
   o.uv = i.uv;
   o.c = i.c;
   o.d = i.p;
   return o;
}
// Hachage sans sinus (identique d'une carte graphique à l'autre).
float3 hash33(float3 p)
{
   p = frac(p * float3(0.1031, 0.1030, 0.0973));
   p += dot(p, p.yxz + 33.33);
   return frac((p.xxy + p.yxx) * p.zyx);
}
float3 starLayer(float3 d, float k, float density, float time)
{
   float3 p = d * k;
   float3 c = floor(p);
   float3 h = hash33(c);
   if (h.x > density) return 0;
   float3 s = c + 0.2 + 0.6 * hash33(c + 17.0);
   float dist = length(p - s);
   float px = max(length(fwidth(p)) * 0.7, 1e-5);
   float mag = pow(h.y, 3.2);
   bool bright = h.z < 0.015;
   float level = bright ? 1.6 : 0.3 + 1.1 * mag;
   float rStar = (bright ? 0.0022 : 0.0007 + 0.001 * mag) * k;
   float r = max(rStar, px);
   float a = saturate(1 - dist / r);
   a *= a * min(1, (rStar * rStar) / (r * r) * 2);
   float3 h2 = hash33(c + 91.0);
   float twinkle = h2.x < 0.12 ? 1 + 0.08 * sin(6.2831853 * ((0.15 + 0.2 * h2.y) * time + h2.z)) : 1;
   float3 col = h2.y < 0.7 ? float3(0.90, 0.94, 0.93) : (h2.z < 0.67 ? float3(0.72, 0.82, 1.0) : float3(1.0, 0.89, 0.76));
   return col * level * a * twinkle;
}
float3 rotateAbout(float3 v, float3 axis, float angle)
{
   float s = sin(angle), co = cos(angle);
   return v * co + cross(axis, v) * s + axis * dot(axis, v) * (1 - co);
}
float glowAt(float3 d, float3 p, float radius)
{
   float a = length(d - p);
   return exp(-(a * a) / (radius * radius));
}
float3 passage(float3 d, int k)
{
   float kind = evA[k].w, elapsed = evC[k].x, duration = evC[k].y, trail = evC[k].z;
   if (kind < 0.5 || elapsed < 0 || elapsed > duration) return 0;
   float edge = kind > 3.5 ? 0.15 : 4.0; // apparitions fondues (traînée laser : brève)
   float f = saturate(elapsed / edge) * saturate((duration - elapsed) / edge);
   float angle = evB[k].w * elapsed;
   float3 head = rotateAbout(evA[k].xyz, evB[k].xyz, angle);
   float3 res = 0;
   if (kind < 1.5) // convoi : quatre lumières
   {
      for (int i = 0; i < 4; i++)
         res += float3(0.75, 0.91, 0.88) * 1.4 * glowAt(d, rotateAbout(evA[k].xyz, evB[k].xyz, angle - i * 0.028), 0.0026);
   }
   else if (kind < 2.5) // satellite : un point, un feu rouge qui clignote lentement
   {
      res += float3(0.55, 0.62, 0.6) * 1.3 * glowAt(d, head, 0.0024);
      float blink = step(0.85, frac(elapsed * 0.5));
      res += float3(1.0, 0.25, 0.25) * blink * glowAt(d, rotateAbout(head, evB[k].xyz, -0.005), 0.002);
   }
   else // comète et traînée laser : une tête et sa traînée
   {
      bool laser = kind > 3.5;
      res += (laser ? float3(0.21, 0.79, 0.71) * 1.5 : float3(0.85, 0.96, 0.94) * 1.4) * glowAt(d, head, laser ? 0.002 : 0.0042);
      for (int i = 1; i <= 12; i++)
      {
         float t = i / 12.0;
         float3 q = rotateAbout(evA[k].xyz, evB[k].xyz, angle - trail * t);
         float w = laser ? 0.0016 : 0.003 + 0.009 * t;
         res += float3(0.21, 0.79, 0.71) * (1 - t) * (laser ? 0.6 : 0.35) * glowAt(d, q, w);
         res += float3(0.11, 0.56, 0.5) * (1 - t) * 0.08 * glowAt(d, q, w * 4);
      }
   }
   return res * f;
}
float4 skyPs(VO i) : SV_TARGET
{
   float3 d = normalize(i.d);
   float3 col = tex.Sample(smp, i.uv).rgb * i.c.rgb;
   col += starLayer(d, 40, 0.22, extra.y) + starLayer(d, 90, 0.05, extra.y);
   col += passage(d, 0) + passage(d, 1);
   return float4(col * flags.w, 1);
}
)";

struct Constants
{
   float mvp[16];
   float sky[16];
   float tint[4];
   float flags[4];
   float extra[4];
   float evA[2][4];
   float evB[2][4];
   float evC[2][4];
};

struct Vertex
{
   float p[3];
   float uv[2];
   float c[4];
};

bool Renderer::init(ID3D11Device* device, std::string& error)
{
   m_device = device;
   auto compile = [&](const char* entry, const char* target, ComPtr<ID3DBlob>& code) {
      ComPtr<ID3DBlob> messages;
      if (FAILED(D3DCompile(kShader, std::strlen(kShader), "decor", nullptr, nullptr, entry, target, 0, 0, &code, &messages)))
      {
         error = messages ? std::string(static_cast<const char*>(messages->GetBufferPointer()), messages->GetBufferSize()) : "D3DCompile";
         return false;
      }
      return true;
   };
   ComPtr<ID3DBlob> vs, ps, skyVs, skyPs;
   if (!compile("vs", "vs_5_0", vs) || !compile("ps", "ps_5_0", ps) || !compile("skyVs", "vs_5_0", skyVs) || !compile("skyPs", "ps_5_0", skyPs))
      return false;
   device->CreateVertexShader(vs->GetBufferPointer(), vs->GetBufferSize(), nullptr, &m_vs);
   device->CreatePixelShader(ps->GetBufferPointer(), ps->GetBufferSize(), nullptr, &m_ps);
   device->CreateVertexShader(skyVs->GetBufferPointer(), skyVs->GetBufferSize(), nullptr, &m_skyVs);
   device->CreatePixelShader(skyPs->GetBufferPointer(), skyPs->GetBufferSize(), nullptr, &m_skyPs);
   const D3D11_INPUT_ELEMENT_DESC layout[] = {
      { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0, D3D11_INPUT_PER_VERTEX_DATA, 0 },
      { "TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 12, D3D11_INPUT_PER_VERTEX_DATA, 0 },
      { "COLOR", 0, DXGI_FORMAT_R32G32B32A32_FLOAT, 0, 20, D3D11_INPUT_PER_VERTEX_DATA, 0 },
   };
   device->CreateInputLayout(layout, 3, vs->GetBufferPointer(), vs->GetBufferSize(), &m_layout);

   D3D11_BUFFER_DESC cb {};
   cb.ByteWidth = sizeof(Constants);
   cb.Usage = D3D11_USAGE_DEFAULT;
   cb.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
   device->CreateBuffer(&cb, nullptr, &m_constants);

   D3D11_SAMPLER_DESC sd {};
   sd.Filter = D3D11_FILTER_ANISOTROPIC;
   sd.MaxAnisotropy = 8;
   sd.AddressU = sd.AddressV = sd.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
   sd.MaxLOD = D3D11_FLOAT32_MAX;
   device->CreateSamplerState(&sd, &m_clamp);
   sd.AddressU = D3D11_TEXTURE_ADDRESS_WRAP;
   device->CreateSamplerState(&sd, &m_wrap);

   D3D11_RASTERIZER_DESC rd {};
   rd.FillMode = D3D11_FILL_SOLID;
   rd.CullMode = D3D11_CULL_NONE;
   rd.DepthClipEnable = FALSE; // le ciel est posé au fond de la profondeur
   device->CreateRasterizerState(&rd, &m_raster);

   D3D11_DEPTH_STENCIL_DESC dd {};
   dd.DepthEnable = TRUE;
   dd.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ALL;
   dd.DepthFunc = D3D11_COMPARISON_LESS_EQUAL;
   device->CreateDepthStencilState(&dd, &m_depthWrite);
   dd.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ZERO;
   device->CreateDepthStencilState(&dd, &m_depthRead);
   device->CreateDepthStencilState(&dd, &m_depthSky);

   D3D11_BLEND_DESC bd {};
   bd.RenderTarget[0].RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
   device->CreateBlendState(&bd, &m_opaque);
   bd.RenderTarget[0].BlendEnable = TRUE;
   bd.RenderTarget[0].SrcBlend = D3D11_BLEND_SRC_ALPHA;
   bd.RenderTarget[0].DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
   bd.RenderTarget[0].BlendOp = D3D11_BLEND_OP_ADD;
   bd.RenderTarget[0].SrcBlendAlpha = D3D11_BLEND_ZERO;
   bd.RenderTarget[0].DestBlendAlpha = D3D11_BLEND_ONE;
   bd.RenderTarget[0].BlendOpAlpha = D3D11_BLEND_OP_ADD;
   device->CreateBlendState(&bd, &m_alpha);
   bd.RenderTarget[0].DestBlend = D3D11_BLEND_ONE;
   device->CreateBlendState(&bd, &m_additive);
   if (!m_vs || !m_ps || !m_skyVs || !m_skyPs || !m_layout || !m_constants || !m_clamp || !m_wrap || !m_raster || !m_depthWrite || !m_depthRead || !m_opaque
      || !m_alpha || !m_additive)
   {
      error = "états Direct3D du décor refusés";
      return false;
   }
   return true;
}

void Renderer::setTint(float r, float g, float b)
{
   auto lin = [](float c) { return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f); };
   m_tint[0] = lin(r), m_tint[1] = lin(g), m_tint[2] = lin(b);
}

static std::wstring widen(const std::string& utf8)
{
   const int n = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), static_cast<int>(utf8.size()), nullptr, 0);
   std::wstring w(n, L'\0');
   MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), static_cast<int>(utf8.size()), w.data(), n);
   return w;
}

/** Nombre d'un champ de `j`, ou `fallback`. */
static double num(const Json& j, const char* key, double fallback)
{
   const Json* v = j.get(key);
   return v ? v->number(fallback) : fallback;
}

bool Renderer::load(const std::string& path, std::string& error)
{
   m_parts.clear();
   m_materials.clear();
   m_textures.clear();
   if (path.empty())
      return true;
   std::ifstream file(widen(path), std::ios::binary);
   std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
   auto u32 = [&](size_t at) {
      uint32_t v;
      std::memcpy(&v, bytes.data() + at, 4);
      return v;
   };
   if (bytes.size() < 28 || u32(0) != 0x46546c67 || u32(4) != 2 || u32(16) != 0x4e4f534a)
   {
      error = "décor illisible (pas un glb) : " + path;
      return false;
   }
   const uint32_t jsonLength = u32(12);
   const size_t binAt = 20 + static_cast<size_t>(jsonLength);
   if (binAt + 8 > bytes.size() || u32(binAt + 4) != 0x004e4942)
   {
      error = "décor illisible (bloc binaire absent)";
      return false;
   }
   const std::string text(reinterpret_cast<const char*>(bytes.data() + 20), jsonLength);
   const uint8_t* bin = bytes.data() + binAt + 8;
   const size_t binLength = std::min<size_t>(u32(binAt), bytes.size() - binAt - 8);
   Json root;
   if (!JsonReader(text).parse(root))
   {
      error = "décor illisible (JSON)";
      return false;
   }
   const JsonArray* views = root.get("bufferViews") ? root.get("bufferViews")->array() : nullptr;
   const JsonArray* accessors = root.get("accessors") ? root.get("accessors")->array() : nullptr;
   if (!views || !accessors)
   {
      error = "décor illisible (accesseurs)";
      return false;
   }
   auto viewBytes = [&](int index, size_t& size) -> const uint8_t* {
      if (index < 0 || index >= static_cast<int>(views->size()))
         return nullptr;
      const Json& v = (*views)[index];
      const size_t offset = static_cast<size_t>(num(v, "byteOffset", 0));
      size = static_cast<size_t>(num(v, "byteLength", 0));
      return offset + size <= binLength ? bin + offset : nullptr;
   };
   // Données d'un accesseur : pointeur et nombre d'éléments de `width` octets.
   auto accessor = [&](int index, size_t& count, size_t width) -> const uint8_t* {
      count = 0;
      if (index < 0 || index >= static_cast<int>(accessors->size()))
         return nullptr;
      const Json& a = (*accessors)[index];
      count = static_cast<size_t>(num(a, "count", 0));
      size_t size = 0;
      const uint8_t* data = viewBytes(static_cast<int>(num(a, "bufferView", -1)), size);
      return data && count * width <= size ? data : nullptr;
   };

   // Textures : sRGB (l'échantillonnage rend du linéaire), chaîne de mipmaps.
   ComPtr<ID3D11DeviceContext> context;
   m_device->GetImmediateContext(&context);
   std::vector<int> textureSrv, textureWrap;
   const JsonArray* textures = root.get("textures") ? root.get("textures")->array() : nullptr;
   const JsonArray* images = root.get("images") ? root.get("images")->array() : nullptr;
   const JsonArray* samplers = root.get("samplers") ? root.get("samplers")->array() : nullptr;
   if (textures)
      for (const Json& t : *textures)
      {
         const int source = static_cast<int>(num(t, "source", -1));
         const int sampler = static_cast<int>(num(t, "sampler", -1));
         const bool wrap = samplers && sampler >= 0 && sampler < static_cast<int>(samplers->size()) && num((*samplers)[sampler], "wrapS", 0) == 10497;
         textureWrap.push_back(wrap ? 1 : 0);
         textureSrv.push_back(-1);
         if (!images || source < 0 || source >= static_cast<int>(images->size()))
            continue;
         size_t size = 0;
         const uint8_t* data = viewBytes(static_cast<int>(num((*images)[source], "bufferView", -1)), size);
         std::vector<uint8_t> rgba;
         UINT w = 0, h = 0;
         if (!data || !decodeImage(data, size, rgba, w, h))
         {
            const Json* name = (*images)[source].get("name");
            error = "décor : image illisible (" + (name ? name->string() : std::string("?")) + ")";
            return false;
         }
         D3D11_TEXTURE2D_DESC td {};
         td.Width = w, td.Height = h, td.MipLevels = 0, td.ArraySize = 1;
         td.Format = DXGI_FORMAT_R8G8B8A8_UNORM_SRGB;
         td.SampleDesc.Count = 1;
         td.Usage = D3D11_USAGE_DEFAULT;
         td.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
         td.MiscFlags = D3D11_RESOURCE_MISC_GENERATE_MIPS;
         ComPtr<ID3D11Texture2D> texture;
         ComPtr<ID3D11ShaderResourceView> view;
         if (FAILED(m_device->CreateTexture2D(&td, nullptr, &texture)) || FAILED(m_device->CreateShaderResourceView(texture.Get(), nullptr, &view)))
         {
            error = "décor : texture refusée par Direct3D";
            return false;
         }
         context->UpdateSubresource(texture.Get(), 0, nullptr, rgba.data(), w * 4, 0);
         context->GenerateMips(view.Get());
         textureSrv.back() = static_cast<int>(m_textures.size());
         m_textures.push_back(view);
      }

   if (const JsonArray* materials = root.get("materials") ? root.get("materials")->array() : nullptr)
      for (const Json& m : *materials)
      {
         Material mat;
         if (const Json* pbr = m.get("pbrMetallicRoughness"))
         {
            const Json* factor = pbr->get("baseColorFactor");
            if (factor && factor->array() && factor->array()->size() == 4)
               mat.opacity = static_cast<float>((*factor->array())[3].number(1));
            if (const Json* bct = pbr->get("baseColorTexture"))
            {
               const int t = static_cast<int>(num(*bct, "index", -1));
               if (t >= 0 && t < static_cast<int>(textureSrv.size()))
                  mat.texture = textureSrv[t], mat.repeat = textureWrap[t] != 0;
            }
         }
         if (const Json* extras = m.get("extras"))
         {
            const std::string blend = extras->get("blend") ? extras->get("blend")->string() : "opaque";
            mat.blend = blend == "additive" ? 2 : blend == "alpha" ? 1 : 0;
            mat.toneMapped = extras->get("toneMapped") ? extras->get("toneMapped")->boolean(true) : true;
            mat.tinted = extras->get("tinted") ? extras->get("tinted")->boolean(false) : false;
         }
         m_materials.push_back(mat);
      }
   if (m_materials.empty())
      m_materials.push_back({});

   const JsonArray* nodes = root.get("nodes") ? root.get("nodes")->array() : nullptr;
   const JsonArray* meshes = root.get("meshes") ? root.get("meshes")->array() : nullptr;
   if (!nodes || !meshes)
   {
      error = "décor illisible (nœuds)";
      return false;
   }
   for (const Json& node : *nodes)
   {
      const int meshIndex = static_cast<int>(num(node, "mesh", -1));
      if (meshIndex < 0 || meshIndex >= static_cast<int>(meshes->size()))
         continue;
      const Json* primsJson = (*meshes)[meshIndex].get("primitives");
      const JsonArray* prims = primsJson ? primsJson->array() : nullptr;
      if (!prims || prims->empty())
         continue;
      const Json& prim = (*prims)[0];
      const Json* attrs = prim.get("attributes");
      if (!attrs)
         continue;
      size_t count = 0, uvCount = 0, colorCount = 0, indexCount = 0;
      const float* pos = reinterpret_cast<const float*>(accessor(static_cast<int>(num(*attrs, "POSITION", -1)), count, 12));
      const float* uv = reinterpret_cast<const float*>(accessor(static_cast<int>(num(*attrs, "TEXCOORD_0", -1)), uvCount, 8));
      const float* col = reinterpret_cast<const float*>(accessor(static_cast<int>(num(*attrs, "COLOR_0", -1)), colorCount, 16));
      const uint32_t* idx = reinterpret_cast<const uint32_t*>(accessor(static_cast<int>(num(prim, "indices", -1)), indexCount, 4));
      if (!pos || !idx || !count || !indexCount)
         continue;
      std::vector<Vertex> verts(count);
      for (size_t i = 0; i < count; i++)
      {
         std::memcpy(verts[i].p, pos + 3 * i, 12);
         if (uv && uvCount == count)
            std::memcpy(verts[i].uv, uv + 2 * i, 8);
         if (col && colorCount == count)
            std::memcpy(verts[i].c, col + 4 * i, 16);
         else
            verts[i].c[0] = verts[i].c[1] = verts[i].c[2] = verts[i].c[3] = 1;
      }
      Part part;
      D3D11_BUFFER_DESC bd {};
      bd.Usage = D3D11_USAGE_IMMUTABLE;
      bd.ByteWidth = static_cast<UINT>(verts.size() * sizeof(Vertex));
      bd.BindFlags = D3D11_BIND_VERTEX_BUFFER;
      D3D11_SUBRESOURCE_DATA vdata { verts.data(), 0, 0 };
      D3D11_BUFFER_DESC id = bd;
      id.ByteWidth = static_cast<UINT>(indexCount * 4);
      id.BindFlags = D3D11_BIND_INDEX_BUFFER;
      D3D11_SUBRESOURCE_DATA idata { idx, 0, 0 };
      if (FAILED(m_device->CreateBuffer(&bd, &vdata, &part.vertices)) || FAILED(m_device->CreateBuffer(&id, &idata, &part.indices)))
      {
         error = "décor : maillage refusé par Direct3D";
         return false;
      }
      part.count = static_cast<UINT>(indexCount);
      part.material = static_cast<int>(num(prim, "material", 0));
      if (part.material < 0 || part.material >= static_cast<int>(m_materials.size()))
         part.material = 0;
      const Json* name = node.get("name");
      part.sky = name && name->string() == "ciel";
      m_parts.push_back(part);
   }
   if (m_parts.empty())
   {
      error = "décor vide";
      return false;
   }
   return true;
}

void Renderer::draw(ID3D11DeviceContext* context, const scene::Mat4& mvp, const scene::Mat4& sky, double t, float fade)
{
   if (m_parts.empty())
      return;
   Passage ev[2];
   m_sky.update(t, ev);
   Constants k {};
   std::memcpy(k.mvp, mvp.m, sizeof k.mvp);
   std::memcpy(k.sky, sky.m, sizeof k.sky);
   k.tint[0] = m_tint[0], k.tint[1] = m_tint[1], k.tint[2] = m_tint[2], k.tint[3] = 1;
   k.extra[1] = static_cast<float>(std::fmod(t, 3600.0));
   for (int i = 0; i < 2; i++)
   {
      k.evA[i][0] = ev[i].start[0], k.evA[i][1] = ev[i].start[1], k.evA[i][2] = ev[i].start[2], k.evA[i][3] = static_cast<float>(ev[i].kind);
      k.evB[i][0] = ev[i].axis[0], k.evB[i][1] = ev[i].axis[1], k.evB[i][2] = ev[i].axis[2], k.evB[i][3] = ev[i].speed;
      k.evC[i][0] = static_cast<float>(t - ev[i].t0), k.evC[i][1] = static_cast<float>(ev[i].duration), k.evC[i][2] = ev[i].trail;
   }
   context->IASetInputLayout(m_layout.Get());
   context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
   context->VSSetConstantBuffers(0, 1, m_constants.GetAddressOf());
   context->PSSetConstantBuffers(0, 1, m_constants.GetAddressOf());
   context->RSSetState(m_raster.Get());
   const UINT stride = sizeof(Vertex), offset = 0;
   // Trois passes : le ciel au fond, les pièces opaques, puis les translucides (verrière, lueurs, ombre).
   for (int pass = 0; pass < 3; pass++)
      for (const Part& part : m_parts)
      {
         const Material& mat = m_materials[part.material];
         const int wanted = part.sky ? 0 : mat.blend == 0 ? 1 : 2;
         if (wanted != pass || (m_skyOnly && !part.sky))
            continue;
         k.flags[0] = mat.texture >= 0 ? 1.f : 0.f;
         k.flags[1] = mat.toneMapped ? 1.f : 0.f;
         k.flags[2] = mat.tinted ? 1.f : 0.f;
         k.flags[3] = fade;
         k.extra[0] = mat.opacity;
         context->UpdateSubresource(m_constants.Get(), 0, nullptr, &k, 0, 0);
         context->VSSetShader(part.sky ? m_skyVs.Get() : m_vs.Get(), nullptr, 0);
         context->PSSetShader(part.sky ? m_skyPs.Get() : m_ps.Get(), nullptr, 0);
         ID3D11ShaderResourceView* view = mat.texture >= 0 ? m_textures[mat.texture].Get() : nullptr;
         context->PSSetShaderResources(0, 1, &view);
         context->PSSetSamplers(0, 1, mat.repeat ? m_wrap.GetAddressOf() : m_clamp.GetAddressOf());
         context->OMSetDepthStencilState(pass == 0 ? m_depthSky.Get() : pass == 1 ? m_depthWrite.Get() : m_depthRead.Get(), 0);
         context->OMSetBlendState(mat.blend == 2 ? m_additive.Get() : mat.blend == 1 ? m_alpha.Get() : m_opaque.Get(), nullptr, 0xffffffff);
         context->IASetVertexBuffers(0, 1, part.vertices.GetAddressOf(), &stride, &offset);
         context->IASetIndexBuffer(part.indices.Get(), DXGI_FORMAT_R32_UINT, 0);
         context->DrawIndexed(part.count, 0, 0);
      }
   ID3D11ShaderResourceView* none = nullptr;
   context->PSSetShaderResources(0, 1, &none);
}

} // namespace decor
