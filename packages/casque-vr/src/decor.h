// Décor de réalité virtuelle (caisse de flipper et capsule, packages/core/src/decor.ts) : lu dans le
// .glb que Cyber Pinball écrit, dessiné par Direct3D 11 dans la couche de projection, avec la
// profondeur. Les écrans restent des couches « quad » : rien du décor n'est posé sur leur image.
//
// Le ciel est à l'infini (sans parallaxe) : nébuleuses de la texture, étoiles calculées pixel par
// pixel (fines, quelques-unes scintillent), et de temps en temps un passage lointain (convoi de
// lumières, satellite, comète, traînée laser), toujours en hauteur ou sur les côtés.
#pragma once

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <wrl/client.h>

#include <cstdint>
#include <random>
#include <string>
#include <vector>

#include "scene.h"

namespace decor {

/** Un passage dans le ciel (convoi, satellite, comète, traînée laser), en cours ou à venir. */
struct Passage
{
   int kind = 0; // 0 aucun, 1 convoi, 2 satellite, 3 comète, 4 traînée laser
   float start[3] {}; // direction de départ (espace de la borne)
   float axis[3] {}; // axe de rotation de la trajectoire
   float speed = 0; // radians par seconde
   double t0 = 0, duration = 0; // secondes
   float trail = 0; // longueur de la traînée (radians)
};

/** Programme des passages : un événement toutes les 25 à 45 s, deux au plus en même temps. */
class Sky
{
 public:
   Sky();
   /** Passages actifs à l'instant `t` (secondes), au plus deux. */
   void update(double t, Passage out[2]);
   /** Rendu d'essai : un passage de nature `kind` commencé à `t0`. */
   void force(int kind, double t0);

 private:
   std::mt19937 m_rng;
   double m_next = -1;
   std::vector<Passage> m_live;
   Passage make(double t);
};

class Renderer
{
 public:
   bool init(ID3D11Device* device, std::string& error);
   /** Charge le décor (.glb) ; vide : plus de décor. Faux (et `error` rempli) si le fichier est illisible. */
   bool load(const std::string& path, std::string& error);
   bool empty() const { return m_parts.empty(); }
   /** Teinte de la table (sRGB) ; sans teinte, la sarcelle. */
   void setTint(float r, float g, float b);
   /** Rendu d'essai : un passage de nature `kind` (1 convoi, 2 satellite, 3 comète, 4 traînée laser) commencé à `t0`. */
   void forcePassage(int kind, double t0) { m_sky.force(kind, t0); }
   /**
    * Dessine le décor pour un œil : `mvp` de la borne au clip, `sky` la même sans translation (le ciel
    * à l'infini), `t` le temps (secondes), `fade` de 1 (plein) à 0 (noir).
    */
   void draw(ID3D11DeviceContext* context, const scene::Mat4& mvp, const scene::Mat4& sky, double t, float fade);

 private:
   struct Part
   {
      Microsoft::WRL::ComPtr<ID3D11Buffer> vertices, indices;
      UINT count = 0;
      int material = 0;
      bool sky = false;
   };
   struct Material
   {
      int texture = -1;
      bool repeat = false;
      int blend = 0; // 0 opaque, 1 alpha, 2 additif
      float opacity = 1;
      bool toneMapped = true, tinted = false;
   };
   Microsoft::WRL::ComPtr<ID3D11Device> m_device;
   Microsoft::WRL::ComPtr<ID3D11VertexShader> m_vs, m_skyVs;
   Microsoft::WRL::ComPtr<ID3D11PixelShader> m_ps, m_skyPs;
   Microsoft::WRL::ComPtr<ID3D11InputLayout> m_layout;
   Microsoft::WRL::ComPtr<ID3D11Buffer> m_constants;
   Microsoft::WRL::ComPtr<ID3D11SamplerState> m_clamp, m_wrap;
   Microsoft::WRL::ComPtr<ID3D11RasterizerState> m_raster;
   Microsoft::WRL::ComPtr<ID3D11DepthStencilState> m_depthWrite, m_depthRead, m_depthSky;
   Microsoft::WRL::ComPtr<ID3D11BlendState> m_opaque, m_alpha, m_additive;
   std::vector<Microsoft::WRL::ComPtr<ID3D11ShaderResourceView>> m_textures;
   std::vector<Material> m_materials;
   std::vector<Part> m_parts;
   float m_tint[3] { 0.0382f, 0.584f, 0.456f }; // #36c9b4 en linéaire
   Sky m_sky;
};

} // namespace decor
