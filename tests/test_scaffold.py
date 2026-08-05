from ausmammal_explorer import __version__
from ausmammal_explorer.__main__ import main


def test_version_is_defined() -> None:
    assert __version__ == "0.1.0"


def test_scaffold_command(capsys) -> None:
    main()
    output = capsys.readouterr().out
    assert "project scaffold is ready" in output

