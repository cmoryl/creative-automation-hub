on run argv
    set jsxPath to item 1 of argv
    set jsxFile to POSIX file jsxPath
    tell application id "com.adobe.InDesign"
        activate
        do script jsxFile language javascript
    end tell
end run
