# totxt 📄

### Code Repository to Single .txt File

Convert your entire code repository into a single `.txt` file or recreate its structure from the generated text file! 🚀

---

## Features 🌟

- **Convert GitHub or Local Repositories to Text**: Convert entire repositories into a single `.txt` file with file contents. 🌍➡️📑
- **Customizable File Size**: Filter files based on a maximum size (default is 100 KB) to avoid including large, binary, or irrelevant files. 📏
- **Recreate Directory Structure**: Rebuild the file structure from a previously generated `.txt` file. 🔄📂
- **File Type Filtering**: Automatically excludes certain files and directories (e.g., `node_modules`, `.git`, `.exe`). 🚫
- **Readable Output**: Each file is clearly marked with its path and content, making it easy to review and share. 📄💬
- **Progress Bar**: Track the conversion process with a friendly progress bar. 📊
- **Respects .gitignore**: Excludes files and directories specified in the `.gitignore` file. 🛑📜

---

## Install 🔧

```bash
npm install -g totxt
```

---

## Usage 📝

### `create` - Convert Repository to Text File

Convert a local or GitHub repository into a `.txt` file containing its code and content.

```bash
totxt create <path> [options]
```

#### Options:

- `path` (required): Path to your local repository or GitHub URL 🌍
- `-m, --max-size <size>` (optional): Maximum file size in KB to include (default: 100 KB) 📏
- `-o, --output <filename>` (optional): Output text file name (default: `<repo-name>_output.txt`) 🖋️

#### Examples:

- **Simple Usage**:
  ```bash
  totxt create <path>
  ```
- **Convert a GitHub Repo**:
  ```bash
  totxt create https://github.com/username/repository -o <your-directory-name>_output.txt
  ```
- **Convert a Local Repo**:
  ```bash
  totxt create /path/to/your/repo -o <your-directory-name>_output.txt
  ```

---

### `recreate` - Recreate Repository Structure from Text File

Rebuild the file structure from the generated `.txt` file.

```bash
totxt recreate <txt-file> [options]
```

#### Options:

- `txt-file` (required): The `.txt` file containing the repository contents 📄
- `-b, --base-path <path>` (optional): Base directory where the structure will be recreated (default: `.`) 📍

#### Examples:

- **Simple Usage**:

  ```bash
  totxt recreate <output-file-location>
  ```

- **Convert a Local Repo**:
  ```bash
  totxt recreate <your-directory-name>_output.txt -b <your-directory-name>
  ```

---

Enjoy using totxt! 🎉
