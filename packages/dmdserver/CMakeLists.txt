# cyberpinball-dmdserver : dmdserver de libdmdutil sur le dmdutil64.dll de VPX (src/dmdserver.cpp).
# Construction : node scripts/dmdserver.mjs (MSVC, Visual Studio 2022 Build Tools), comme packages/vpx-vision3d.
cmake_minimum_required(VERSION 3.20)
project(cyberpinball-dmdserver CXX)

set(CMAKE_CXX_STANDARD 20) # comme libdmdutil
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# CRT partagé, comme dmdutil64.dll : ses fonctions en ligne (Config::Set…) touchent des std::string
# que la DLL libère ensuite ; un CRT statique leur donnerait un autre tas.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")

# C4251 : membres std:: des classes exportées de libdmdutil ; sans conséquence avec le même CRT partagé.
add_compile_options(/utf-8 /W3 /permissive- /EHsc /wd4251)
add_compile_definitions(NOMINMAX _CRT_SECURE_NO_WARNINGS)

# Bibliothèque d'importation tirée de la liste des exports de la DLL de VPX : rien de binaire dans le dépôt.
set(DMDUTIL_DEF "${CMAKE_CURRENT_SOURCE_DIR}/dmdutil64.def")
set(DMDUTIL_LIB "${CMAKE_CURRENT_BINARY_DIR}/dmdutil64.lib")
add_custom_command(
  OUTPUT "${DMDUTIL_LIB}"
  COMMAND "${CMAKE_AR}" /nologo /machine:x64 "/def:${DMDUTIL_DEF}" "/out:${DMDUTIL_LIB}"
  DEPENDS "${DMDUTIL_DEF}"
  COMMENT "dmdutil64.lib (importation)")
add_custom_target(dmdutil64-import DEPENDS "${DMDUTIL_LIB}")

add_executable(cyberpinball-dmdserver src/dmdserver.cpp)
add_dependencies(cyberpinball-dmdserver dmdutil64-import)
target_include_directories(cyberpinball-dmdserver PRIVATE vendor/libdmdutil vendor/sockpp)
target_link_libraries(cyberpinball-dmdserver PRIVATE "${DMDUTIL_LIB}" delayimp ws2_32 bcrypt)
# Chargée à la demande, depuis le dossier passé par -d (plugins\dmdutil de VPX).
target_link_options(cyberpinball-dmdserver PRIVATE /DELAYLOAD:dmdutil64.dll)
