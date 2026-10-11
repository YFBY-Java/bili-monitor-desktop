class FirstReadProbe:
    def __init__(self, stdin, record):
        self._stdin = stdin
        self._record = record
        self._first = True
        self._lookup_first = True

    def __getattribute__(self, name):
        value = object.__getattribute__(self, name)
        if name == "readline" and object.__getattribute__(self, "_lookup_first"):
            self._lookup_first = False
            self._emit("stdin:first-read-lookup")
        return value

    def __getattr__(self, name):
        return getattr(self._stdin, name)

    def _emit(self, stage):
        try:
            self._record(stage)
        except Exception:
            pass  # Test diagnostics cannot replace a real read result/error.

    def readline(self, *args, **kwargs):
        if not self._first:
            return self._stdin.readline(*args, **kwargs)
        self._first = False
        self._emit("stdin:first-read-enter")
        try:
            line = self._stdin.readline(*args, **kwargs)
        except BaseException:
            self._emit("stdin:first-read-error")
            raise
        self._emit("stdin:first-read-line" if line else "stdin:first-read-eof")
        return line


def observe_first_read(stdin, enabled, record):
    return FirstReadProbe(stdin, record) if enabled else stdin
