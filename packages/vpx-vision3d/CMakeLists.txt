# Plugin VPX « Vision3D » et son banc d'essai.
# Construction : node scripts/vision3d.mjs --banc (MSVC, Visual Studio 2022 Build Tools).
cmake_minimum_required(VERSION 3.20)
project(vision3d CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded") # CRT statique : aucune DLL Visual C++ à installer

add_compile_options(/utf-8 /W4 /permissive- /wd4201) # C4201 : unions anonymes des en-têtes de VPX

add_library(vision3d SHARED src/vision3d.cpp)
target_include_directories(vision3d PRIVATE vendor/vpx src)
target_link_libraries(vision3d PRIVATE ws2_32)
set_target_properties(vision3d PROPERTIES OUTPUT_NAME "plugin-vision3d64" PREFIX "")

add_executable(banc-vision3d test/banc.cpp)
target_include_directories(banc-vision3d PRIVATE vendor/vpx src)
target_link_libraries(banc-vision3d PRIVATE ws2_32)

# Fausse Kinect10.dll (essais de la Vision 3D sans capteur).
add_library(kinect-factice SHARED test/kinect-factice.cpp)
set_target_properties(kinect-factice PROPERTIES OUTPUT_NAME "kinect-factice" PREFIX "")

# Plugin VPX « CyberPinball » : la pause dans le casque, dessinée sur le fronton de la scène VR.
add_library(cyberpinball SHARED src/cyberpinball.cpp)
target_include_directories(cyberpinball PRIVATE vendor/vpx src)
set_target_properties(cyberpinball PROPERTIES OUTPUT_NAME "plugin-cyberpinball64" PREFIX "")
# Version de VPX (GetFileVersionInfoW) : la table des actions ne vaut que pour 10.8.1.
target_link_libraries(cyberpinball PRIVATE version)

# Plugin VPX « CyberPinballDmd » : le DMD remplit sa fenêtre quand elle change de taille en partie (toutes les parties).
add_library(cyberpinball-dmd SHARED src/dmd-suivi.cpp)
target_include_directories(cyberpinball-dmd PRIVATE vendor/vpx src)
set_target_properties(cyberpinball-dmd PROPERTIES OUTPUT_NAME "plugin-cyberpinballdmd64" PREFIX "")

# Banc du suivi de la fenêtre du DMD (logique, sans VPX).
add_executable(banc-suivi-dmd test/banc-suivi-dmd.cpp)
target_include_directories(banc-suivi-dmd PRIVATE src)

# Banc de la pause (logique, sans VPX ni casque).
add_executable(banc-pause test/banc-pause.cpp)
target_include_directories(banc-pause PRIVATE src)

# Runtime OpenXR factice à cadence exacte (test/runtime-cadence.cpp) : celui du compagnon, dont l'attente d'une
# image ne dépend plus de la minuterie de Windows. Pour le banc de VPX (scripts/banc-vpx.mjs --cadence exacte).
add_library(runtime-cadence SHARED test/runtime-cadence.cpp)
target_include_directories(runtime-cadence PRIVATE ../casque-vr/third_party)
target_compile_options(runtime-cadence PRIVATE /wd4505) # la fonction d'attente remplace Sleep : une seule fois utilisée
target_link_libraries(runtime-cadence PRIVATE d3d11 dxgi)
set_target_properties(runtime-cadence PROPERTIES OUTPUT_NAME "runtime-cadence" PREFIX "")
