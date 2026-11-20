# Plugins VPX de Cyber Pinball (Vision3D, CyberPinball, CyberPinballDmd) et leurs bancs d'essai.
# Construction : node scripts/vision3d.mjs [--banc] (MSVC, Visual Studio 2022 Build Tools).
cmake_minimum_required(VERSION 3.20)
project(vision3d CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded") # CRT statique : aucune DLL Visual C++ à installer

add_compile_options(/utf-8 /W4 /permissive- /wd4201) # C4201 : unions anonymes des en-têtes de VPX

# Les plugins, construits une fois par API de plugins de VPX, depuis le même source : en-têtes de
# vendor/vpx-<version>, CYBERPINBALL_VPX_API (compat/vpx-compat.h). VPX 10.8.1 : build\vision3d\Release, noms de
# cibles d'origine ; VPX 10.9.0 : build\vision3d\Release\vpx-10.9.0, cibles suffixées « -10.9.0 ». Mêmes noms de
# DLL dans les deux dossiers : app/src/vpx-plugins.ts copie dans chaque VPX le jeu de sa version (vpxPluginSet).
function(plugins_vpx_pour version api)
  if(version STREQUAL "10.8.1")
    set(s "")
  else()
    set(s "-${version}")
  endif()
  set(entetes vendor/vpx-${version} compat src)

  # « Vision3D » : suivi de la tête.
  add_library(vision3d${s} SHARED src/vision3d.cpp)
  target_link_libraries(vision3d${s} PRIVATE ws2_32)
  set_target_properties(vision3d${s} PROPERTIES OUTPUT_NAME "plugin-vision3d64" PREFIX "")

  add_executable(banc-vision3d${s} test/banc.cpp)
  target_link_libraries(banc-vision3d${s} PRIVATE ws2_32)
  set_target_properties(banc-vision3d${s} PROPERTIES OUTPUT_NAME "banc-vision3d")

  # « CyberPinball » : la pause dans le casque, dessinée sur le fronton de la scène VR.
  add_library(cyberpinball${s} SHARED src/cyberpinball.cpp)
  set_target_properties(cyberpinball${s} PROPERTIES OUTPUT_NAME "plugin-cyberpinball64" PREFIX "")
  # Version de VPX (GetFileVersionInfoW) : la table des actions de pause.h dépend de la version.
  target_link_libraries(cyberpinball${s} PRIVATE version)

  # « CyberPinballDmd » : le DMD remplit sa fenêtre quand elle change de taille en partie (toutes les parties).
  add_library(cyberpinball-dmd${s} SHARED src/dmd-suivi.cpp)
  set_target_properties(cyberpinball-dmd${s} PROPERTIES OUTPUT_NAME "plugin-cyberpinballdmd64" PREFIX "")

  foreach(cible IN ITEMS vision3d banc-vision3d cyberpinball cyberpinball-dmd)
    target_include_directories(${cible}${s} PRIVATE ${entetes})
    target_compile_definitions(${cible}${s} PRIVATE CYBERPINBALL_VPX_API=${api})
    if(s)
      # Avec une expression de générateur, CMake n'ajoute pas lui-même le dossier de la configuration.
      set(sortie "${CMAKE_BINARY_DIR}/$<CONFIG>/vpx-${version}")
      set_target_properties(${cible}${s} PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${sortie}" LIBRARY_OUTPUT_DIRECTORY "${sortie}"
        ARCHIVE_OUTPUT_DIRECTORY "${sortie}" PDB_OUTPUT_DIRECTORY "${sortie}")
    endif()
  endforeach()
endfunction()

plugins_vpx_pour("10.8.1" 100801)
plugins_vpx_pour("10.9.0" 100900)

# Fausse Kinect10.dll (essais de la Vision 3D sans capteur).
add_library(kinect-factice SHARED test/kinect-factice.cpp)
set_target_properties(kinect-factice PROPERTIES OUTPUT_NAME "kinect-factice" PREFIX "")

# Banc du suivi de la fenêtre du DMD (logique, sans VPX).
add_executable(banc-suivi-dmd test/banc-suivi-dmd.cpp)
target_include_directories(banc-suivi-dmd PRIVATE src)

# Banc de la cadence des images (logique, sans VPX).
add_executable(banc-cadence test/banc-cadence.cpp)
target_include_directories(banc-cadence PRIVATE src)

# Banc du relevé des arrêts (où était le fil des images pendant un à-coup), sans VPX.
add_executable(banc-arrets test/banc-arrets.cpp)
target_include_directories(banc-arrets PRIVATE src)

# Banc de la pause (logique, sans VPX ni casque) : tables des actions de chaque version de VPX comprises.
add_executable(banc-pause test/banc-pause.cpp)
target_include_directories(banc-pause PRIVATE src)

# Runtime OpenXR factice à cadence exacte (test/runtime-cadence.cpp) : celui du compagnon, dont l'attente d'une
# image ne dépend plus de la minuterie de Windows. Pour le banc de VPX (scripts/banc-vpx.mjs --cadence exacte).
add_library(runtime-cadence SHARED test/runtime-cadence.cpp)
target_include_directories(runtime-cadence PRIVATE ../casque-vr/third_party)
target_compile_options(runtime-cadence PRIVATE /wd4505) # la fonction d'attente remplace Sleep : une seule fois utilisée
target_link_libraries(runtime-cadence PRIVATE d3d11 dxgi)
set_target_properties(runtime-cadence PROPERTIES OUTPUT_NAME "runtime-cadence" PREFIX "")
