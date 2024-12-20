#!/usr/bin/env python3

import os
import logging
import tempfile
from pathlib import Path
import chardet
import typer
import subprocess
from rich.console import Console
from rich.logging import RichHandler
from rich.progress import (
    Progress, SpinnerColumn, TextColumn, BarColumn,
    TaskProgressColumn, TimeRemainingColumn
)

app = typer.Typer()

class SourceCodeConverter:
    """
    A utility to convert source code files in a repository into a single text file,
    respecting the .gitignore and excluding unnecessary files.
    """

    def __init__(self, max_file_size: int = 100, log_level: int = logging.INFO):
        logging.basicConfig(
            level=log_level,
            format="%(message)s",
            datefmt="[%X]",
            handlers=[RichHandler(rich_tracebacks=True)]
        )
        self.logger = logging.getLogger("SourceCodeConverter")
        self.max_file_size = max_file_size * 1024  # KB to bytes
        self.exclude_dirs = {'.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build'}
        self.gitignore_patterns = set()
        self.console = Console()

    def load_gitignore(self, repo_path: Path):
        gitignore_file = repo_path / ".gitignore"
        if gitignore_file.is_file():
            with open(gitignore_file, 'r') as f:
                for line in f:
                    stripped = line.strip()
                    if stripped and not stripped.startswith('#'):
                        self.gitignore_patterns.add(stripped)

    def is_ignored(self, file_path: Path, repo_path: Path) -> bool:
        rel_path = file_path.relative_to(repo_path)
        return any(rel_path.match(pattern) for pattern in self.gitignore_patterns)

    def is_text_file(self, file_path: Path) -> bool:
        try:
            if os.path.getsize(file_path) > self.max_file_size:
                return False
            with open(file_path, 'rb') as file:
                if b'\0' in file.read(1024):  # Check for null bytes in the first 1KB
                    return False
            return True
        except Exception as e:
            self.logger.warning(f"Error checking file {file_path}: {e}")
            return False

    def detect_encoding(self, file_path: Path) -> str:
        try:
            with open(file_path, 'rb') as file:
                raw_data = file.read(10000)
                result = chardet.detect(raw_data)
                return result['encoding'] or 'utf-8'
        except Exception:
            return 'utf-8'

    def read_source_file(self, file_path: Path) -> str:
        try:
            encoding = self.detect_encoding(file_path)
            with open(file_path, 'r', encoding=encoding, errors='ignore') as file:
                return file.read()
        except Exception as e:
            self.logger.warning(f"Error reading {file_path}: {e}")
            return ""

    def convert_repository(self, repo_path: Path, output_path: Path):
        self.load_gitignore(repo_path)
        with Progress(
            SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
            BarColumn(), TaskProgressColumn(), TimeRemainingColumn()
        ) as progress:
            overall_task = progress.add_task("[green]Processing Repository...", total=100)

            try:
                with open(output_path, 'w', encoding='utf-8') as outfile:
                    outfile.write(f"# Repository: {repo_path}\n")
                    outfile.write("=" * 50 + "\n\n")

                    processed_files = 0
                    for root, dirs, files in os.walk(repo_path):
                        dirs[:] = [d for d in dirs if d not in self.exclude_dirs]
                        for file in files:
                            file_path = Path(root) / file
                            if self.is_text_file(file_path) and not self.is_ignored(file_path, repo_path):
                                try:
                                    relative_path = file_path.relative_to(repo_path)
                                    outfile.write(f"### SOURCE FILE: {relative_path}\n")
                                    outfile.write("-" * 50 + "\n")
                                    content = self.read_source_file(file_path)
                                    outfile.write(content + "\n\n")
                                    processed_files += 1
                                except Exception as e:
                                    self.logger.error(f"Error processing {file_path}: {e}")
                    progress.update(overall_task, completed=100)

                self.console.print(f"[bold green]Conversion successful![/]")
                self.console.print(f"[bold]Processed Files:[/] {processed_files}")
                self.console.print(f"[bold]Output File:[/] {output_path}")
            except Exception as e:
                self.logger.error(f"Error during conversion: {e}")

    def clone_and_convert(self, repo_url: str, output_path: Path):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            subprocess.run(["git", "clone", repo_url, str(temp_path)], check=True)
            self.convert_repository(temp_path, output_path)


@app.command()
def convert(
    repo_path: str = typer.Argument(..., help="Local path or GitHub repository URL."),
    max_size: int = typer.Option(100, help="Maximum file size in KB."),
    output: Path = typer.Option(None, help="Custom output filename."),
    verbose: bool = typer.Option(False, help="Enable verbose logging.")
):
    """Convert source code from a local path or GitHub repo into a single text file."""
    log_level = logging.DEBUG if verbose else logging.INFO
    output_file = output or Path(f"{Path(repo_path).stem}_output.txt")

    converter = SourceCodeConverter(max_file_size=max_size, log_level=log_level)

    if "github.com" in repo_path:
        converter.console.print("[bold blue]Processing GitHub repository...[/]")
        converter.clone_and_convert(repo_path, output_file)
    else:
        converter.convert_repository(Path(repo_path), output_file)

if __name__ == "__main__":
    app()
