!include "LogicLib.nsh"
!include "WordFunc.nsh"

!ifndef BUILD_UNINSTALLER
Var inkInstalledVersion
Var inkVersionDecision
Var inkEqualFound

; Shared by the real installer and the non-installing native test harness.
; Registry text must be numeric (three or four parts). Unknown formats fail closed.
Function InkDiceCompareInstalledVersion
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy $inkVersionDecision "invalid"
  ${StrFilter} "$inkInstalledVersion" "1" "." "" $0
  ${If} $0 != $inkInstalledVersion
    Goto inkCompareDone
  ${EndIf}
  StrCpy $1 0
  StrCpy $2 1
  StrCpy $3 0
  StrCpy $4 ""
  ${Do}
    StrCpy $0 $inkInstalledVersion 1 $1
    ${If} $0 == "."
    ${OrIf} $0 == ""
      ${If} $3 == 0
      ${OrIf} $4 > 65535
        Goto inkCompareDone
      ${EndIf}
      ; VersionCompare gives leading zeroes special meaning; reject rather
      ; than guessing whether an old registry value meant a decimal segment.
      ${If} $3 > 1
        StrCpy $0 $4 1
        ${If} $0 == "0"
          Goto inkCompareDone
        ${EndIf}
        StrCpy $0 $inkInstalledVersion 1 $1
      ${EndIf}
      ${If} $0 == ""
        ${ExitDo}
      ${EndIf}
      IntOp $2 $2 + 1
      ${If} $2 > 4
        Goto inkCompareDone
      ${EndIf}
      StrCpy $3 0
      StrCpy $4 ""
    ${Else}
      IntOp $3 $3 + 1
      ${If} $3 > 5
        Goto inkCompareDone
      ${EndIf}
      StrCpy $4 "$4$0"
    ${EndIf}
    IntOp $1 $1 + 1
  ${Loop}
  ${If} $2 < 3
    Goto inkCompareDone
  ${EndIf}
  ${VersionCompare} "$inkInstalledVersion" "${VERSION}" $0
  ${If} $0 == 1
    StrCpy $inkVersionDecision "newer"
  ${ElseIf} $0 == 0
    StrCpy $inkVersionDecision "equal"
  ${Else}
    StrCpy $inkVersionDecision "older"
  ${EndIf}
inkCompareDone:
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; This runs in .onInit, before electron-builder uninstalls or replaces any files.
!macro InkDiceCheckRegistration ROOT VIEW
  SetRegView ${VIEW}
  ReadRegStr $inkInstalledVersion ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $inkInstalledVersion != ""
  ${OrIf} $0 != ""
    Call InkDiceCompareInstalledVersion
    ${If} $inkVersionDecision == "newer"
      IfSilent +2
      MessageBox MB_OK|MB_ICONEXCLAMATION "已安装墨骰工坊 $inkInstalledVersion，高于当前安装包 ${VERSION}。为避免降级损坏数据，本次安装已停止。请使用相同或更新版本的安装包。"
      SetErrorLevel 1638
      Quit
    ${ElseIf} $inkVersionDecision == "invalid"
      IfSilent +2
      MessageBox MB_OK|MB_ICONSTOP "检测到墨骰工坊安装记录，但版本无法安全识别：$inkInstalledVersion。未修改程序或人物数据，请先核对已安装版本。"
      SetErrorLevel 13
      Quit
    ${ElseIf} $inkVersionDecision == "equal"
      StrCpy $inkEqualFound "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  Push $0
  StrCpy $inkEqualFound "0"
  ; Scan both views and scopes before offering repair, so a higher version wins.
  !insertmacro InkDiceCheckRegistration HKCU 64
  !insertmacro InkDiceCheckRegistration HKLM 64
  !insertmacro InkDiceCheckRegistration HKCU 32
  !insertmacro InkDiceCheckRegistration HKLM 32
  SetRegView 64
  Pop $0
  ${If} $inkEqualFound == "1"
    ; Silent same-version invocation is an idempotent no-op, not forced reinstall.
    IfSilent inkSameExit
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "已安装墨骰工坊 ${VERSION}。是否重新安装以修复程序文件？人物存档和用户资料库将保留。" IDYES inkSameContinue
inkSameExit:
    SetErrorLevel 0
    Quit
inkSameContinue:
  ${EndIf}
!macroend
!endif

!macro customInstall
  CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
  CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\卸载墨骰工坊.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend

!macro customUnInstall
  ; Only our own shortcut. The standard uninstaller handles program files.
  ; Never delete APPDATA, character JSON, user library, or user-selected folders.
  Delete "$SMPROGRAMS\${MENU_FILENAME}\卸载墨骰工坊.lnk"
!macroend
