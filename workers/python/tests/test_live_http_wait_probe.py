import importlib.util
import io
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "first_read_probe", Path(__file__).parent / "fixtures/live_http_wait/first_read_probe.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
observe_first_read = module.observe_first_read


def test_real_reads_are_lazy_and_only_first_read_is_recorded():
    events = []
    original = io.StringIO("synthetic-private-line\nsecond\n")
    proxy = observe_first_read(original, True, events.append)
    assert events == []
    assert proxy.readline() == "synthetic-private-line\n"
    assert events == [
        "stdin:first-read-lookup",
        "stdin:first-read-enter",
        "stdin:first-read-line",
    ]
    assert proxy.readline() == "second\n"
    assert len(events) == 3
    assert proxy.closed is original.closed
    assert observe_first_read(original, False, events.append) is original


def test_eof_is_recorded_once():
    events = []
    proxy = observe_first_read(io.StringIO(""), True, events.append)
    assert proxy.readline() == ""
    assert proxy.readline() == ""
    assert events == [
        "stdin:first-read-lookup",
        "stdin:first-read-enter",
        "stdin:first-read-eof",
    ]


@pytest.mark.parametrize("fails", [False, True])
@pytest.mark.parametrize("broken_record", [False, True])
def test_parameters_result_and_error_identity_survive_diagnostics(fails, broken_record):
    result = object()
    error = OSError("synthetic")
    calls = []
    events = []

    class Input:
        encoding = "synthetic"

        def readline(self, *args, **kwargs):
            calls.append((args, kwargs))
            if fails:
                raise error
            return result

    def record(stage):
        events.append(stage)
        if broken_record:
            raise RuntimeError("synthetic diagnostic failure")

    original = Input()
    proxy = observe_first_read(original, True, record)
    assert calls == []
    assert proxy.encoding == original.encoding
    for _ in range(2):
        if fails:
            with pytest.raises(OSError) as caught:
                proxy.readline(7, size=9)
            assert caught.value is error
        else:
            assert proxy.readline(7, size=9) is result
    assert calls == [((7,), {"size": 9}), ((7,), {"size": 9})]
    assert events == [
        "stdin:first-read-lookup",
        "stdin:first-read-enter",
        "stdin:first-read-error" if fails else "stdin:first-read-line",
    ]


@pytest.mark.parametrize("use_getattr", [False, True])
@pytest.mark.parametrize("broken_record", [False, True])
def test_first_bound_method_lookup_is_lazy_once_and_keeps_method_identity(
    use_getattr, broken_record
):
    events = []
    calls = []
    result = object()

    class Input:
        delegated = result

        def readline(self, *args, **kwargs):
            calls.append((args, kwargs))
            return result

    def record(stage):
        events.append(stage)
        if broken_record:
            raise RuntimeError("synthetic diagnostic failure")

    original = Input()
    proxy = observe_first_read(original, True, record)
    assert events == []
    method = getattr(proxy, "readline") if use_getattr else proxy.readline
    assert calls == []
    assert events == ["stdin:first-read-lookup"]
    repeated = proxy.readline
    assert method.__self__ is proxy
    assert repeated.__self__ is proxy
    assert method.__func__ is module.FirstReadProbe.readline
    assert repeated.__func__ is method.__func__
    assert events == ["stdin:first-read-lookup"]
    assert proxy.delegated is result
    with pytest.raises(AttributeError):
        proxy.missing_attribute
    assert calls == []
    assert method(7, size=9) is result
    assert calls == [((7,), {"size": 9})]
    assert events == [
        "stdin:first-read-lookup",
        "stdin:first-read-enter",
        "stdin:first-read-line",
    ]
    assert observe_first_read(original, False, record) is original
    assert len(events) == 3
