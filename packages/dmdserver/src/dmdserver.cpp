// cyberpinball-dmdserver : le dmdserver de libdmdutil, construit sur le dmdutil64.dll que VPX installe
// lui-même (plugins\dmdutil). Image du menu de Cyber Pinball sur le DMD réel (app/src/dmd-server.ts).
//
// D'après src/server.cpp de libdmdutil (https://github.com/vpinball/libdmdutil, commit 3485e2e, GPLv3+),
// modifié pour Cyber Pinball :
//   - dmdutil64.dll chargé à la demande (/DELAYLOAD) depuis le dossier passé par -d : aucune DLL copiée,
//     exactement la version de libdmdutil de VPX (ZeDMD, ZeDMD en wifi, PIN2DMD, Pixelcade) ;
//   - avant tout, son empreinte SHA-256 est comparée à celles de src/empreintes.h : une DLL inconnue
//     n'est jamais chargée (code 6), car une autre version de libdmdutil peut changer la disposition de
//     ses classes sans changer ses fonctions ;
//   - puis ses fonctions sont toutes liées : une DLL absente ou à qui il en manque arrête le serveur avec
//     un code dit (3, 4), sans fenêtre d'erreur de Windows ;
//   - --verifier : contrôle seul de cette DLL, sans chercher de DMD ;
//   - options lues sans cargs (même syntaxe que le dmdserver d'origine).

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <delayimp.h>

#include <chrono>
#include <csignal>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#include "DMDUtil/Config.h"
#include "DMDUtil/DMDServer.h"
#include "DMDUtil/Logger.h"
#include "empreintes.h"

namespace
{

constexpr const char* kDll = "dmdutil64.dll";

/** Codes de sortie lus par app/src/dmd-server.ts. */
enum Exit : int
{
  kOk = 0,
  kStartFailed = 1,  // port pris, adresse invalide
  kNoDisplay = 2,    // aucun DMD (sans -w)
  kDllMissing = 3,   // dmdutil64.dll introuvable ou impossible à charger (dossier, Visual C++)
  kDllMismatch = 4,  // dmdutil64.dll d'une autre version : une fonction manque
  kUsage = 5,
  kDllUnknown = 6,   // dmdutil64.dll dont l'empreinte n'est pas dans src/empreintes.h : jamais chargé
};

volatile std::sig_atomic_t running = 1;

void OnSignal(int) { running = 0; }

BOOL WINAPI OnConsole(DWORD)
{
  running = 0;
  return TRUE;
}

void DMDUTILCALLBACK LogCallback(DMDUtil_LogLevel, const char* format, va_list args)
{
  char buffer[1024];
  vsnprintf(buffer, sizeof(buffer), format, args);
  fprintf(stderr, "%s\n", buffer);
  fflush(stderr);
}

/** Échec du chargement différé : dit quoi, et s'arrête (jamais l'exception par défaut, ni de fenêtre). */
FARPROC WINAPI OnDelayLoadFailure(unsigned notify, PDelayLoadInfo info)
{
  if (notify == dliFailLoadLib)
  {
    fprintf(stderr, "dmdutil64.dll introuvable ou impossible a charger (erreur %lu).\n", info ? info->dwLastError : 0UL);
    fflush(stderr);
    ExitProcess(kDllMissing);
  }
  if (notify == dliFailGetProc)
  {
    const char* name = info && info->dlp.fImportByName ? info->dlp.szProcName : "?";
    fprintf(stderr, "dmdutil64.dll d'une autre version : fonction absente %s\n", name);
    fflush(stderr);
    ExitProcess(kDllMismatch);
  }
  return nullptr;
}

void Usage()
{
  printf(
      "Usage: cyberpinball-dmdserver [OPTION]...\n"
      "  -d, --dmdutil DOSSIER      dossier de dmdutil64.dll (plugins\\dmdutil de VPX ; defaut : celui du programme)\n"
      "  -c, --config FICHIER       dmdserver.ini\n"
      "  -o, --alt-color-path DOSSIER\n"
      "  -u, --pup-videos-path DOSSIER\n"
      "  -a, --addr ADRESSE         defaut : localhost\n"
      "  -p, --port PORT            defaut : 6789\n"
      "  -w, --wait-for-displays    attendre un DMD plutot que s'arreter\n"
      "  -l, --logging              journal sur la sortie d'erreur\n"
      "  -v, --verbose-logging\n"
      "      --verifier             controle seul de dmdutil64.dll et de son empreinte (code 0, 3, 4 ou 6)\n"
      "  -h, --help\n");
}

/** Dossier du programme (par défaut, dmdutil64.dll à côté de lui). */
std::wstring ProgramDir()
{
  wchar_t path[MAX_PATH * 2];
  DWORD n = GetModuleFileNameW(nullptr, path, static_cast<DWORD>(std::size(path)));
  std::wstring dir(path, n);
  size_t slash = dir.find_last_of(L"\\/");
  return slash == std::wstring::npos ? L"." : dir.substr(0, slash);
}

std::wstring Widen(const char* s)
{
  int n = MultiByteToWideChar(CP_UTF8, 0, s, -1, nullptr, 0);
  std::wstring w(n > 0 ? n - 1 : 0, L'\0');
  if (n > 1) MultiByteToWideChar(CP_UTF8, 0, s, -1, w.data(), n);
  return w;
}

/** Empreinte SHA-256 (hexadécimal, minuscules) de ce fichier, ou chaîne vide s'il ne se lit pas. */
std::string Sha256(const std::wstring& file)
{
  HANDLE h = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
  if (h == INVALID_HANDLE_VALUE) return {};
  std::string hex;
  BCRYPT_ALG_HANDLE alg = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  if (BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0)) &&
      BCRYPT_SUCCESS(BCryptCreateHash(alg, &hash, nullptr, 0, nullptr, 0, 0)))
  {
    std::vector<unsigned char> buffer(1 << 16);
    DWORD read = 0;
    bool ok = true;
    while (ok && ReadFile(h, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr) && read > 0)
      ok = BCRYPT_SUCCESS(BCryptHashData(hash, buffer.data(), read, 0));
    unsigned char digest[32];
    if (ok && BCRYPT_SUCCESS(BCryptFinishHash(hash, digest, sizeof(digest), 0)))
    {
      static const char* digits = "0123456789abcdef";
      for (unsigned char b : digest)
      {
        hex += digits[b >> 4];
        hex += digits[b & 15];
      }
    }
  }
  if (hash) BCryptDestroyHash(hash);
  if (alg) BCryptCloseAlgorithmProvider(alg, 0);
  CloseHandle(h);
  return hex;
}

/** La version de VPX de cette empreinte, ou nullptr si elle n'est pas dans src/empreintes.h. */
const char* KnownVpx(const std::string& sha256)
{
  for (const KnownDmdUtil& known : kKnownDmdUtil)
    if (sha256 == known.sha256) return known.vpx;
  return nullptr;
}

/**
 * Charge dmdutil64.dll depuis ce dossier (ses propres DLL, zedmd64, libusb…, cherchées à côté d'elle),
 * puis lie toutes les fonctions dont ce programme a besoin.
 */
int LoadDmdUtil(const std::wstring& dir, const char** vpx)
{
  SetDllDirectoryW(dir.c_str());
  std::wstring dll = dir + L"\\dmdutil64.dll";
  if (GetFileAttributesW(dll.c_str()) == INVALID_FILE_ATTRIBUTES)
  {
    fprintf(stderr, "dmdutil64.dll absent de ce dossier.\n");
    return kDllMissing;
  }
  // Avant tout chargement : une DLL inconnue n'exécute rien, pas même son DllMain.
  std::string sha256 = Sha256(dll);
  if (sha256.empty())
  {
    fprintf(stderr, "dmdutil64.dll illisible (erreur %lu).\n", GetLastError());
    return kDllMissing;
  }
  *vpx = KnownVpx(sha256);
  if (!*vpx)
  {
    fprintf(stderr, "dmdutil64.dll d'une version de VPX non prise en charge (empreinte %s).\n", sha256.c_str());
    return kDllUnknown;
  }
  if (!LoadLibraryExW(dll.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH))
  {
    fprintf(stderr, "dmdutil64.dll impossible a charger (erreur %lu ; Visual C++ 2015-2022 x64 installe ?).\n", GetLastError());
    return kDllMissing;
  }
  // Toutes les fonctions liées d'un coup : une absente passe par OnDelayLoadFailure (code 4).
  if (FAILED(__HrLoadAllImportsForDll(kDll)))
  {
    fprintf(stderr, "dmdutil64.dll : fonctions impossibles a lier.\n");
    return kDllMismatch;
  }
  return kOk;
}

}  // namespace

// Crochet du chargement différé (delayimp.h) : lu par l'éditeur de liens sous ce nom.
const PfnDliHook __pfnDliFailureHook2 = OnDelayLoadFailure;

int main(int argc, char* argv[])
{
  // Jamais de fenêtre d'erreur de Windows : le menu lit le code de sortie et le journal.
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
  std::signal(SIGTERM, OnSignal);
  std::signal(SIGINT, OnSignal);
  SetConsoleCtrlHandler(OnConsole, TRUE);

  std::wstring dmdutilDir = ProgramDir();
  const char* config = nullptr;
  const char* altColorPath = nullptr;
  const char* pupVideosPath = nullptr;
  const char* addr = nullptr;
  int port = 0;
  bool wait = false, logging = false, verbose = false, verifyOnly = false;

  for (int i = 1; i < argc; i++)
  {
    std::string a = argv[i];
    auto value = [&](const char* shortName, const char* longName) -> const char*
    {
      if (a != shortName && a != longName) return nullptr;
      if (i + 1 >= argc)
      {
        fprintf(stderr, "%s : valeur attendue.\n", a.c_str());
        std::exit(kUsage);
      }
      return argv[++i];
    };
    if (const char* v = value("-d", "--dmdutil")) dmdutilDir = Widen(v);
    else if (const char* v = value("-c", "--config")) config = v;
    else if (const char* v = value("-o", "--alt-color-path")) altColorPath = v;
    else if (const char* v = value("-u", "--pup-videos-path")) pupVideosPath = v;
    else if (const char* v = value("-a", "--addr")) addr = v;
    else if (const char* v = value("-p", "--port")) port = std::atoi(v);
    else if (a == "-w" || a == "--wait-for-displays") wait = true;
    else if (a == "-l" || a == "--logging") logging = true;
    else if (a == "-v" || a == "--verbose-logging") verbose = logging = true;
    else if (a == "--verifier") verifyOnly = true;
    else if (a == "-h" || a == "--help")
    {
      Usage();
      return kOk;
    }
    else
    {
      fprintf(stderr, "Option inconnue : %s\n", a.c_str());
      Usage();
      return kUsage;
    }
  }

  const char* vpx = nullptr;
  if (int loaded = LoadDmdUtil(dmdutilDir, &vpx); loaded != kOk) return loaded;
  if (verifyOnly)
  {
    printf("dmdutil64.dll : compatible (%s).\n", vpx);
    return kOk;
  }

  // La suite suit server.cpp de libdmdutil.
  DMDUtil::Config* pConfig = DMDUtil::Config::GetInstance();
  pConfig->SetDMDServer(false);  // C'est le serveur : il ne se connecte jamais à un autre serveur.
  if (config) pConfig->parseConfigFile(config);
  if (altColorPath) pConfig->SetAltColorPath(altColorPath);
  if (pupVideosPath) pConfig->SetPUPVideosPath(pupVideosPath);
  if (addr) pConfig->SetDMDServerAddr(addr);
  if (port > 0) pConfig->SetDMDServerPort(port);
  if (logging) pConfig->SetLogCallback(LogCallback);
  if (verbose && config) DMDUtil::Log(DMDUtil_LogLevel_INFO, "Loaded config file");

  DMDUtil::DMD* pDmd = new DMDUtil::DMD();

  while (running)
  {
    pDmd->FindDisplays();
    while (DMDUtil::DMD::IsFinding()) std::this_thread::sleep_for(std::chrono::milliseconds(100));

    if (pDmd->HasDisplay() || !wait) break;
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
  }

  if (!pDmd->HasDisplay())
  {
    DMDUtil::Log(DMDUtil_LogLevel_ERROR, "No DMD displays found.");
    delete pDmd;
    return running ? kNoDisplay : kOk;
  }

  std::string fixedAltColorPath = pConfig->GetAltColorPath();
  std::string fixedPupVideosPath = pConfig->GetPUPVideosPath();

  {
    DMDUtil::DMDServer server(pDmd, !fixedAltColorPath.empty(), !fixedPupVideosPath.empty());

    if (!server.Start(pConfig->GetDMDServerAddr(), static_cast<in_port_t>(pConfig->GetDMDServerPort())))
    {
      delete pDmd;
      return kStartFailed;
    }

    while (running && server.IsRunning() && pDmd->HasDisplay())
    {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    server.Stop();
  }
  delete pDmd;
  return kOk;
}
