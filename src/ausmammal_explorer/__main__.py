"""Command-line entry point for the initial project scaffold."""

from ausmammal_explorer import __version__


def main() -> None:
    """Confirm that the local package can be imported and executed."""
    print(f"AusMammal Explorer {__version__}: project scaffold is ready.")


if __name__ == "__main__":
    main()

