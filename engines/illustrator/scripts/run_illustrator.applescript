on run argv
    set jsxPath to item 1 of argv
    set jsxContent to (do shell script "cat " & quoted form of jsxPath)
    try
        tell application "Adobe Illustrator"
            activate
            do javascript jsxContent
        end tell
    on error errMsg number errNum
        -- Surface Illustrator errors (launch dialogs, scripting disabled, JS exceptions)
        -- as stderr text so the Node caller can capture and display them.
        set fullMsg to "Illustrator script error (" & errNum & "): " & errMsg
        do shell script "echo " & quoted form of fullMsg & " >&2; exit 1"
    end try
end run
