!macro bmdPrepareInstallerTemp
  CreateDirectory "D:\BiliMonitor Installer Temp"
  UnsafeStrCpy $TEMP "D:\BiliMonitor Installer Temp"
  ; Child processes (including the old uninstaller during upgrades) inherit D.
  System::Call 'Kernel32::SetEnvironmentVariableW(w "TEMP", w "$TEMP") i .r0'
  System::Call 'Kernel32::SetEnvironmentVariableW(w "TMP", w "$TEMP") i .r0'
!macroend

!macro customUnPreInit
  !insertmacro bmdPrepareInstallerTemp
!macroend

!macro preInit
  !ifdef BUILD_UNINSTALLER
    StrCpy $INSTDIR "$TEMP"
  !else
  ${IfNot} ${FileExists} "D:\*.*"
    MessageBox MB_OK|MB_ICONSTOP "此版本需要 D 盘，用来存放程序与采集数据。未发现 D 盘，安装已取消。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; Set before the first plug-in is initialized; the large embedded archive
  ; and extraction workspace must not use the Windows C-drive TEMP default.
  !insertmacro bmdPrepareInstallerTemp
  StrCpy $INSTDIR "D:\BiliMonitor Desktop"
  ${If} ${FileExists} "$INSTDIR\*.*"
    ${IfNot} ${FileExists} "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
      MessageBox MB_OK|MB_ICONSTOP "D:\BiliMonitor Desktop 已存在其他文件。为保护文件，安装已取消；请先将该文件夹改名后重试。" /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
  !endif
!macroend

!macro customInit
  ; Keep this release's fixed application directory separate from user data.
  ; In particular, do not accept /D=D:\ or /D=<the data directory>.
  StrCpy $INSTDIR "D:\BiliMonitor Desktop"
  ${If} $installMode == "all"
    MessageBox MB_OK|MB_ICONSTOP "此安装包仅支持当前用户安装。请先卸载旧的所有用户版本，再重新安装。采集数据不会删除。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customInstallMode
  ; initMultiUser already selected the current/existing user scope. Do not let
  ; the assisted mode page reset the D-drive directory to LocalAppData.
  Abort
!macroend

!macro customCacheInstaller
  ; No auto-updater: do not duplicate this offline installer in C-drive AppData.
!macroend
