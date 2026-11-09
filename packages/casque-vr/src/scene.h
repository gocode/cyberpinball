// Scène de la borne en volume (packages/core/src/casque-scene.ts) : boîtes, rectangles et disques
// mats, sans texture, dessinés par Direct3D 11 dans la couche de projection, sous les panneaux.
#pragma once

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <wrl/client.h>

#include <string>
#include <vector>

namespace scene {

/**
 * Fond de la couche de projection : le vide de la charte (#030807), en lumière linéaire. Au-delà
 * des bords du mur et du sol, le casque montrait sinon du noir pur, qui se distingue du fond.
 */
inline constexpr float kVoid[4] = { 0.000911f, 0.002428f, 0.002125f, 1.f };

/** Matrice 4 × 4 rangée par lignes, pour des vecteurs colonnes : v' = M v. */
struct Mat4
{
   float m[16];
   static Mat4 identity();
   /** Pose (rotation unitaire x, y, z, w puis translation). */
   static Mat4 pose(const float q[4], const float t[3]);
   /** Inverse d'une pose : la vue d'un œil. */
   static Mat4 poseInverse(const float q[4], const float t[3]);
   /** Projection d'OpenXR (angles du champ, en radians) vers la profondeur de Direct3D (0 près, 1 loin). */
   static Mat4 projection(float left, float right, float up, float down, float nearZ, float farZ);
   Mat4 operator*(const Mat4& b) const;
};

struct Vertex
{
   float p[3];
   float n[3];
   float c[4]; // linéaire, alpha droit
};

/** Une ligne du protocole (« boite … », « quad … », « disque … ») ajoutée aux maillages. Faux : ligne illisible. */
bool addPrimitive(const std::string& line, std::vector<Vertex>& opaque, std::vector<Vertex>& transparent);

class Renderer
{
 public:
   /** Shaders et états ; faux (et `error` rempli) si Direct3D refuse. */
   bool init(ID3D11Device* device, std::string& error);
   /** Remplace la scène (sommets dans l'espace de la borne). */
   void setScene(const std::vector<Vertex>& opaque, const std::vector<Vertex>& transparent);
   bool empty() const { return m_opaqueCount + m_transparentCount == 0; }
   /** Dessine la scène pour un œil : `mvp` de la borne au clip, `world` de la borne à la pièce, `fade` de 1 (plein) à 0 (noir). */
   void draw(ID3D11DeviceContext* context, const Mat4& mvp, const Mat4& world, float fade);

 private:
   Microsoft::WRL::ComPtr<ID3D11Device> m_device;
   Microsoft::WRL::ComPtr<ID3D11VertexShader> m_vs;
   Microsoft::WRL::ComPtr<ID3D11PixelShader> m_ps;
   Microsoft::WRL::ComPtr<ID3D11InputLayout> m_layout;
   Microsoft::WRL::ComPtr<ID3D11Buffer> m_constants;
   Microsoft::WRL::ComPtr<ID3D11Buffer> m_opaque, m_transparent;
   UINT m_opaqueCount = 0, m_transparentCount = 0;
   Microsoft::WRL::ComPtr<ID3D11RasterizerState> m_raster;
   Microsoft::WRL::ComPtr<ID3D11DepthStencilState> m_depthWrite, m_depthRead;
   Microsoft::WRL::ComPtr<ID3D11BlendState> m_blendOff, m_blendOn;
};

/**
 * Copie d'une image d'écran, avec sa chaîne de mipmaps et de quoi l'échantillonner : l'écran posé
 * dans la scène reste net de loin sans scintiller. Faux si Direct3D refuse.
 */
bool makeImage(ID3D11Device* device, UINT width, UINT height, DXGI_FORMAT format, Microsoft::WRL::ComPtr<ID3D11Texture2D>& texture,
   Microsoft::WRL::ComPtr<ID3D11ShaderResourceView>& view);

/**
 * Image d'un écran (un panneau) dessinée dans la couche de projection, avec la profondeur : la scène
 * (sol, repères du calage, bout des manettes) passe devant ou derrière, comme dans la pièce. L'image
 * porte les octets de l'écran (sRGB) ; elle est ramenée en lumière linéaire pour l'image de l'œil.
 */
class ImageRenderer
{
 public:
   bool init(ID3D11Device* device, std::string& error);
   /**
    * `corners` : haut-gauche, haut-droit, bas-gauche, bas-droit, dans l'espace de `mvp` ; `uv` : la
    * part de l'image (gauche, haut, droite, bas, en fractions) ; `fade` de 1 (plein) à 0 (noir).
    */
   void draw(ID3D11DeviceContext* context, const Mat4& mvp, const float corners[4][3], const float uv[4], ID3D11ShaderResourceView* image, float fade);

 private:
   Microsoft::WRL::ComPtr<ID3D11VertexShader> m_vs;
   Microsoft::WRL::ComPtr<ID3D11PixelShader> m_ps;
   Microsoft::WRL::ComPtr<ID3D11InputLayout> m_layout;
   Microsoft::WRL::ComPtr<ID3D11Buffer> m_constants, m_vertices;
   Microsoft::WRL::ComPtr<ID3D11SamplerState> m_sampler;
   Microsoft::WRL::ComPtr<ID3D11RasterizerState> m_raster;
   Microsoft::WRL::ComPtr<ID3D11DepthStencilState> m_depth;
   Microsoft::WRL::ComPtr<ID3D11BlendState> m_blend;
};

} // namespace scene
