// beatsheet's keys on Windows: generic credentials in Windows Credential Manager (the Mac uses the Keychain), filed
// under "beatsheet:<service>". Built by the engine with PowerShell's C# compiler the first time it's needed.
//
//   beatsheet-credentials set <service>      the key comes on stdin, never on the command line
//   beatsheet-credentials get <service>      the key on stdout; exit 3 when there's none
//   beatsheet-credentials delete <service>
//
// Errors go to stderr as "error <message>" with a non-zero exit.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

static class Program {
  const uint CRED_TYPE_GENERIC = 1;
  const uint CRED_PERSIST_LOCAL_MACHINE = 2;
  const int ERROR_NOT_FOUND = 1168;

  // Fields Windows fills in, never assigned here.
#pragma warning disable 649
  [StructLayout(LayoutKind.Sequential)]
  struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
#pragma warning restore 649

  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDelete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr buffer);

  static int Fail(string message, int code) {
    Console.Error.WriteLine("error " + message);
    return code;
  }

  static int Main(string[] args) {
    if (args.Length != 2) return Fail("usage: beatsheet-credentials <set|get|delete> <service>", 2);
    string target = "beatsheet:" + args[1];
    if (args[0] == "set") {
      string secret = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false)).ReadToEnd().Trim();
      if (secret.Length == 0) return Fail("no key given", 2);
      byte[] blob = Encoding.Unicode.GetBytes(secret);
      if (blob.Length > 2560) return Fail("that key is too long to keep", 2);
      CREDENTIAL c = new CREDENTIAL();
      c.Type = CRED_TYPE_GENERIC;
      c.Persist = CRED_PERSIST_LOCAL_MACHINE;
      c.TargetName = Marshal.StringToCoTaskMemUni(target);
      c.UserName = Marshal.StringToCoTaskMemUni(args[1]);
      c.Comment = Marshal.StringToCoTaskMemUni("beatsheet: " + args[1]);
      c.CredentialBlobSize = (uint)blob.Length;
      c.CredentialBlob = Marshal.AllocCoTaskMem(blob.Length);
      Marshal.Copy(blob, 0, c.CredentialBlob, blob.Length);
      try {
        if (!CredWrite(ref c, 0)) return Fail("Credential Manager refused it (" + Marshal.GetLastWin32Error() + ")", 1);
      } finally {
        Marshal.FreeCoTaskMem(c.TargetName);
        Marshal.FreeCoTaskMem(c.UserName);
        Marshal.FreeCoTaskMem(c.Comment);
        Marshal.FreeCoTaskMem(c.CredentialBlob);
      }
      return 0;
    }
    if (args[0] == "get") {
      IntPtr p;
      if (!CredRead(target, CRED_TYPE_GENERIC, 0, out p)) {
        int e = Marshal.GetLastWin32Error();
        return e == ERROR_NOT_FOUND ? 3 : Fail("couldn't read it (" + e + ")", 1);
      }
      try {
        CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
        string secret = c.CredentialBlobSize > 0 ? Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize / 2) : "";
        Stream stdout = Console.OpenStandardOutput();
        byte[] bytes = new UTF8Encoding(false).GetBytes(secret);
        stdout.Write(bytes, 0, bytes.Length);
        stdout.Flush();
      } finally {
        CredFree(p);
      }
      return 0;
    }
    if (args[0] == "delete") {
      if (!CredDelete(target, CRED_TYPE_GENERIC, 0) && Marshal.GetLastWin32Error() != ERROR_NOT_FOUND) return Fail("couldn't delete it", 1);
      return 0;
    }
    return Fail("unknown command " + args[0], 2);
  }
}
