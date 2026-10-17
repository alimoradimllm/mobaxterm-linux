import ctypes, os, subprocess, sys, tempfile
ctypes.windll.kernel32.SetConsoleCtrlHandler(None, True)   # deliberately launch with Ctrl+C ignored
t = os.path.join(tempfile.gettempdir(), "moraxterm-ui-test")
env = dict(os.environ, APPDATA=t + "\appdata", LOCALAPPDATA=t + "\local",
           WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333")
p = subprocess.Popen([os.path.abspath(sys.argv[1])], env=env, creationflags=0x00000008 | 0x00000200)
print("pid", p.pid, "(launched with Ctrl+C ignored)")
