#include "scene.h"

#include <d3dcompiler.h>

#include <cmath>
#include <cstring>
#include <sstream>

using Microsoft::WRL::ComPtr;

namespace scene {

// ---------------------------------------------------------------------------
// Matrices

Mat4 Mat4::identity()
{
   return { { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 } };
}

static void rotation(const float q[4], float r[9])
{
   const float x = q[0], y = q[1], z = q[2], w = q[3];
   r[0] = 1 - 2 * (y * y + z * z), r[1] = 2 * (x * y - w * z), r[2] = 2 * (x * z + w * y);
   r[3] = 2 * (x * y + w * z), r[4] = 1 - 2 * (x * x + z * z), r[5] = 2 * (y * z - w * x);
   r[6] = 2 * (x * z - w * y), r[7] = 2 * (y * z + w * x), r[8] = 1 - 2 * (x * x + y * y);
}

Mat4 Mat4::pose(const float q[4], const float t[3])
{
   float r[9];
   rotation(q, r);
   return { { r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2], 0, 0, 0, 1 } };
}

Mat4 Mat4::poseInverse(const float q[4], const float t[3])
{
   float r[9];
   rotation(q, r);
   // Rᵀ et -Rᵀ t.
   const float tx = -(r[0] * t[0] + r[3] * t[1] + r[6] * t[2]);
   const float ty = -(r[1] * t[0] + r[4] * t[1] + r[7] * t[2]);
   const float tz = -(r[2] * t[0] + r[5] * t[1] + r[8] * t[2]);
   return { { r[0], r[3], r[6], tx, r[1], r[4], r[7], ty, r[2], r[5], r[8], tz, 0, 0, 0, 1 } };
}

Mat4 Mat4::projection(float left, float right, float up, float down, float nearZ, float farZ)
{
   const float l = std::tan(left), r = std::tan(right), u = std::tan(up), d = std::tan(down);
   const float a = -farZ / (farZ - nearZ), b = -farZ * nearZ / (farZ - nearZ);
   return { { 2 / (r - l), 0, (r + l) / (r - l), 0, 0, 2 / (u - d), (u + d) / (u - d), 0, 0, 0, a, b, 0, 0, -1, 0 } };
}

Mat4 Mat4::operator*(const Mat4& b) const
{
   Mat4 o {};
   for (int i = 0; i < 4; i++)
      for (int j = 0; j < 4; j++)
      {
         float s = 0;
         for (int k = 0; k < 4; k++)
            s += m[i * 4 + k] * b.m[k * 4 + j];
         o.m[i * 4 + j] = s;
      }
   return o;
}

// ---------------------------------------------------------------------------
// Formes

struct Color
{
   float r, g, b, a;
};

static float linear(float c)
{
   return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f);
}

/** « #rrggbbaa » (sRGB) en couleur linéaire. */
static bool parseColor(const std::string& s, Color& c)
{
   if (s.size() != 9 || s[0] != '#')
      return false;
   unsigned v[4];
   for (int i = 0; i < 4; i++)
   {
      char* end = nullptr;
      const std::string part = s.substr(1 + 2 * i, 2);
      v[i] = std::strtoul(part.c_str(), &end, 16);
      if (!end || *end)
         return false;
   }
   c = { linear(v[0] / 255.f), linear(v[1] / 255.f), linear(v[2] / 255.f), v[3] / 255.f };
   return true;
}

struct V3
{
   float x, y, z;
};

static V3 rotate(const float q[4], V3 v)
{
   float r[9];
   rotation(q, r);
   return { r[0] * v.x + r[1] * v.y + r[2] * v.z, r[3] * v.x + r[4] * v.y + r[5] * v.z, r[6] * v.x + r[7] * v.y + r[8] * v.z };
}

static void push(std::vector<Vertex>& out, V3 p, V3 n, const Color& c)
{
   out.push_back({ { p.x, p.y, p.z }, { n.x, n.y, n.z }, { c.r, c.g, c.b, c.a } });
}

/** Deux triangles a b c, a c d. */
static void face(std::vector<Vertex>& out, V3 a, V3 b, V3 c, V3 d, V3 n, const Color& ca, const Color& cb, const Color& cc, const Color& cd)
{
   push(out, a, n, ca), push(out, b, n, cb), push(out, c, n, cc);
   push(out, a, n, ca), push(out, c, n, cc), push(out, d, n, cd);
}

bool addPrimitive(const std::string& line, std::vector<Vertex>& opaque, std::vector<Vertex>& transparent)
{
   std::istringstream in(line);
   std::string kind;
   in >> kind;
   float c[3], q[4];
   if (kind == "boite")
   {
      float s[3];
      std::string color, bottom;
      in >> c[0] >> c[1] >> c[2] >> q[0] >> q[1] >> q[2] >> q[3] >> s[0] >> s[1] >> s[2] >> color >> bottom;
      Color side, under;
      if (!in || !parseColor(color, side) || !parseColor(bottom, under))
         return false;
      auto& out = side.a >= 1.f && under.a >= 1.f ? opaque : transparent;
      const V3 center { c[0], c[1], c[2] };
      auto at = [&](float x, float y, float z) {
         const V3 r = rotate(q, { x * s[0] / 2, y * s[1] / 2, z * s[2] / 2 });
         return V3 { center.x + r.x, center.y + r.y, center.z + r.z };
      };
      // Six faces : normale locale, et ses quatre coins.
      struct F
      {
         V3 n;
         float corners[4][3];
      };
      const F faces[6] = {
         { { 1, 0, 0 }, { { 1, -1, -1 }, { 1, 1, -1 }, { 1, 1, 1 }, { 1, -1, 1 } } },
         { { -1, 0, 0 }, { { -1, -1, 1 }, { -1, 1, 1 }, { -1, 1, -1 }, { -1, -1, -1 } } },
         { { 0, 1, 0 }, { { -1, 1, -1 }, { -1, 1, 1 }, { 1, 1, 1 }, { 1, 1, -1 } } },
         { { 0, -1, 0 }, { { -1, -1, 1 }, { -1, -1, -1 }, { 1, -1, -1 }, { 1, -1, 1 } } },
         { { 0, 0, 1 }, { { -1, -1, 1 }, { 1, -1, 1 }, { 1, 1, 1 }, { -1, 1, 1 } } },
         { { 0, 0, -1 }, { { 1, -1, -1 }, { -1, -1, -1 }, { -1, 1, -1 }, { 1, 1, -1 } } },
      };
      // Le dessous : la face dont la normale descend le plus.
      int lowest = 0;
      float lowestY = 2;
      for (int f = 0; f < 6; f++)
         if (const float y = rotate(q, faces[f].n).y; y < lowestY)
            lowestY = y, lowest = f;
      for (int f = 0; f < 6; f++)
      {
         const Color& col = f == lowest ? under : side;
         const auto& k = faces[f].corners;
         face(out, at(k[0][0], k[0][1], k[0][2]), at(k[1][0], k[1][1], k[1][2]), at(k[2][0], k[2][1], k[2][2]), at(k[3][0], k[3][1], k[3][2]), rotate(q, faces[f].n), col, col,
            col, col);
      }
      return true;
   }
   if (kind == "quad")
   {
      float w, h;
      std::string top, bottom;
      in >> c[0] >> c[1] >> c[2] >> q[0] >> q[1] >> q[2] >> q[3] >> w >> h >> top >> bottom;
      Color ct, cb;
      if (!in || !parseColor(top, ct) || !parseColor(bottom, cb))
         return false;
      auto& out = ct.a >= 1.f && cb.a >= 1.f ? opaque : transparent;
      auto at = [&](float x, float y) {
         const V3 r = rotate(q, { x * w / 2, y * h / 2, 0 });
         return V3 { c[0] + r.x, c[1] + r.y, c[2] + r.z };
      };
      face(out, at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), rotate(q, { 0, 0, 1 }), cb, cb, ct, ct);
      return true;
   }
   if (kind == "disque")
   {
      float radius;
      std::string inner, outer;
      in >> c[0] >> c[1] >> c[2] >> radius >> inner >> outer;
      Color ci, co;
      if (!in || !parseColor(inner, ci) || !parseColor(outer, co))
         return false;
      auto& out = ci.a >= 1.f && co.a >= 1.f ? opaque : transparent;
      constexpr int segments = 96;
      const V3 center { c[0], c[1], c[2] }, up { 0, 1, 0 };
      for (int i = 0; i < segments; i++)
      {
         const float a0 = 6.2831853f * i / segments, a1 = 6.2831853f * (i + 1) / segments;
         push(out, center, up, ci);
         push(out, { c[0] + radius * std::cos(a1), c[1], c[2] + radius * std::sin(a1) }, up, co);
         push(out, { c[0] + radius * std::cos(a0), c[1], c[2] + radius * std::sin(a0) }, up, co);
      }
      return true;
   }
   return false;
}

// ---------------------------------------------------------------------------
// Rendu

static const char* kShader = R"(
cbuffer Frame : register(b0)
{
   row_major float4x4 mvp;
   row_major float4x4 world;
   float4 fade; // x : 1 plein, 0 noir
};
struct VI { float3 p : POSITION; float3 n : NORMAL; float4 c : COLOR; };
struct VO { float4 p : SV_POSITION; float4 c : COLOR; };
VO vs(VI i)
{
   VO o;
   o.p = mul(mvp, float4(i.p, 1));
   // Mat, sans reflet : un éclairage doux d'en haut et de face, juste assez pour lire les volumes.
   float3 n = normalize(mul((float3x3)world, i.n));
   float light = 0.72 + 0.28 * saturate(dot(n, normalize(float3(0.25, 1.0, 0.6))));
   o.c = float4(i.c.rgb * light * fade.x, i.c.a);
   return o;
}
float4 ps(VO i) : SV_TARGET { return i.c; }
)";

struct Constants
{
   float mvp[16];
   float world[16];
   float fade[4];
};

bool Renderer::init(ID3D11Device* device, std::string& error)
{
   m_device = device;
   ComPtr<ID3DBlob> vsCode, psCode, messages;
   if (FAILED(D3DCompile(kShader, std::strlen(kShader), "scene", nullptr, nullptr, "vs", "vs_5_0", 0, 0, &vsCode, &messages))
      || FAILED(D3DCompile(kShader, std::strlen(kShader), "scene", nullptr, nullptr, "ps", "ps_5_0", 0, 0, &psCode, &messages)))
   {
      error = messages ? std::string(static_cast<const char*>(messages->GetBufferPointer()), messages->GetBufferSize()) : "D3DCompile";
      return false;
   }
   device->CreateVertexShader(vsCode->GetBufferPointer(), vsCode->GetBufferSize(), nullptr, &m_vs);
   device->CreatePixelShader(psCode->GetBufferPointer(), psCode->GetBufferSize(), nullptr, &m_ps);
   const D3D11_INPUT_ELEMENT_DESC layout[] = {
      { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0, D3D11_INPUT_PER_VERTEX_DATA, 0 },
      { "NORMAL", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 12, D3D11_INPUT_PER_VERTEX_DATA, 0 },
      { "COLOR", 0, DXGI_FORMAT_R32G32B32A32_FLOAT, 0, 24, D3D11_INPUT_PER_VERTEX_DATA, 0 },
   };
   device->CreateInputLayout(layout, 3, vsCode->GetBufferPointer(), vsCode->GetBufferSize(), &m_layout);

   D3D11_BUFFER_DESC cb {};
   cb.ByteWidth = sizeof(Constants);
   cb.Usage = D3D11_USAGE_DEFAULT;
   cb.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
   device->CreateBuffer(&cb, nullptr, &m_constants);

   D3D11_RASTERIZER_DESC rd {};
   rd.FillMode = D3D11_FILL_SOLID;
   rd.CullMode = D3D11_CULL_NONE; // formes fines et rectangles vus des deux côtés
   rd.DepthClipEnable = TRUE;
   rd.MultisampleEnable = FALSE;
   device->CreateRasterizerState(&rd, &m_raster);

   D3D11_DEPTH_STENCIL_DESC dd {};
   dd.DepthEnable = TRUE;
   dd.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ALL;
   dd.DepthFunc = D3D11_COMPARISON_LESS_EQUAL;
   device->CreateDepthStencilState(&dd, &m_depthWrite);
   dd.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ZERO;
   device->CreateDepthStencilState(&dd, &m_depthRead);

   D3D11_BLEND_DESC bd {};
   bd.RenderTarget[0].RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
   device->CreateBlendState(&bd, &m_blendOff);
   bd.RenderTarget[0].BlendEnable = TRUE;
   bd.RenderTarget[0].SrcBlend = D3D11_BLEND_SRC_ALPHA;
   bd.RenderTarget[0].DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
   bd.RenderTarget[0].BlendOp = D3D11_BLEND_OP_ADD;
   bd.RenderTarget[0].SrcBlendAlpha = D3D11_BLEND_ONE;
   bd.RenderTarget[0].DestBlendAlpha = D3D11_BLEND_INV_SRC_ALPHA;
   bd.RenderTarget[0].BlendOpAlpha = D3D11_BLEND_OP_ADD;
   device->CreateBlendState(&bd, &m_blendOn);
   if (!m_vs || !m_ps || !m_layout || !m_constants || !m_raster || !m_depthWrite || !m_depthRead || !m_blendOff || !m_blendOn)
   {
      error = "états Direct3D refusés";
      return false;
   }
   return true;
}

static ComPtr<ID3D11Buffer> vertexBuffer(ID3D11Device* device, const std::vector<Vertex>& v)
{
   ComPtr<ID3D11Buffer> buffer;
   if (v.empty())
      return buffer;
   D3D11_BUFFER_DESC bd {};
   bd.ByteWidth = static_cast<UINT>(v.size() * sizeof(Vertex));
   bd.Usage = D3D11_USAGE_IMMUTABLE;
   bd.BindFlags = D3D11_BIND_VERTEX_BUFFER;
   D3D11_SUBRESOURCE_DATA data { v.data(), 0, 0 };
   device->CreateBuffer(&bd, &data, &buffer);
   return buffer;
}

void Renderer::setScene(const std::vector<Vertex>& opaque, const std::vector<Vertex>& transparent)
{
   m_opaque = vertexBuffer(m_device.Get(), opaque);
   m_transparent = vertexBuffer(m_device.Get(), transparent);
   m_opaqueCount = m_opaque ? static_cast<UINT>(opaque.size()) : 0;
   m_transparentCount = m_transparent ? static_cast<UINT>(transparent.size()) : 0;
}

void Renderer::draw(ID3D11DeviceContext* context, const Mat4& mvp, const Mat4& world, float fade)
{
   Constants k {};
   std::memcpy(k.mvp, mvp.m, sizeof k.mvp);
   std::memcpy(k.world, world.m, sizeof k.world);
   k.fade[0] = fade;
   context->UpdateSubresource(m_constants.Get(), 0, nullptr, &k, 0, 0);
   context->IASetInputLayout(m_layout.Get());
   context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
   context->VSSetShader(m_vs.Get(), nullptr, 0);
   context->VSSetConstantBuffers(0, 1, m_constants.GetAddressOf());
   context->PSSetShader(m_ps.Get(), nullptr, 0);
   context->RSSetState(m_raster.Get());
   const UINT stride = sizeof(Vertex), offset = 0;
   if (m_opaqueCount)
   {
      context->OMSetDepthStencilState(m_depthWrite.Get(), 0);
      context->OMSetBlendState(m_blendOff.Get(), nullptr, 0xffffffff);
      context->IASetVertexBuffers(0, 1, m_opaque.GetAddressOf(), &stride, &offset);
      context->Draw(m_opaqueCount, 0);
   }
   if (m_transparentCount)
   {
      // Filets, halo, zone du mur : par-dessus, sans écrire la profondeur.
      context->OMSetDepthStencilState(m_depthRead.Get(), 0);
      context->OMSetBlendState(m_blendOn.Get(), nullptr, 0xffffffff);
      context->IASetVertexBuffers(0, 1, m_transparent.GetAddressOf(), &stride, &offset);
      context->Draw(m_transparentCount, 0);
   }
}

} // namespace scene
