!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Force re-create desktop shortcut with new icon even in update mode
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"

  ; Force re-create start menu shortcut
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"

  ; Flush Windows shell icon cache
  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
