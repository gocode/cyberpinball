# Compagnon « menu dans le casque » de Cyber Pinball (src/casque.cpp).
# Construit par scripts/casque-vr.mjs (npm run casque-vr, et la fabrication de l'application) :
#   cmake -S packages/casque-vr -B build/casque-vr -A x64 && cmake --build build/casque-vr --config Release
# Exécution C++ liée en statique (/MT) : rien à installer sur la borne. Le chargeur OpenXR n'est pas
# lié : celui de la copie de VPX est chargé à l'exécution (--chargeur).
cmake_minimum_required(VERSION 3.20)
project(cyberpinball_casque LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(cyberpinball-casque src/casque.cpp src/scene.cpp)
target_include_directories(cyberpinball-casque PRIVATE third_party)
target_compile_definitions(cyberpinball-casque PRIVATE UNICODE _UNICODE)
target_compile_options(cyberpinball-casque PRIVATE /W4 /utf-8 /permissive-)
target_link_libraries(cyberpinball-casque PRIVATE d3d11 dxgi d3dcompiler)
