#!/usr/bin/env node

import { program } from "commander";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import simpleGit from "simple-git";
import mime from "mime-types";
import iconv from "iconv-lite";
import { globby } from "globby";
import ProgressBar from "progress";
import ignore from "ignore";

class RepositoryConverter {
  constructor(options = {}) {
    this.maxFileSize = (options.maxFileSize || 100) * 1024;
    this.baseExcludePatterns = [
      "**/node_modules/**",
      "**/.git/**",
      "**/.venv/**",
      "**/venv/**",
      "**/__pycache__/**",
      "**/dist/**",
      "**/build/**",
      "**/*.exe",
      "**/*.dll",
      "**/*.so",
      "**/*.dylib",
      "**/*.pyc",
      "**/*.pyo",
      "**/*.class",
      "**/*.jar",
    ];
    this.logger = this.createLogger();
    this.ignoreFilter = null;
  }

  createLogger() {
    return {
      info: (message) => console.log(chalk.blue(message)),
      success: (message) => console.log(chalk.green(message)),
      warn: (message) => console.warn(chalk.yellow(message)),
      error: (message) => console.error(chalk.red(message)),
    };
  }

  async loadGitignore(repoPath) {
    try {
      const gitignorePath = path.join(repoPath, ".gitignore");
      const exists = await fs
        .access(gitignorePath)
        .then(() => true)
        .catch(() => false);

      if (exists) {
        const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
        this.ignoreFilter = ignore()
          .add("node_modules")
          .add(".git")
          .add("*.log")
          .add("*.lock")
          .add(gitignoreContent);
      }
    } catch (error) {
      this.logger.warn(`Failed to load .gitignore: ${error.message}`);
    }
  }

  async detectFileEncoding(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      return "utf8";
    } catch (error) {
      this.logger.warn(
        `Encoding detection failed for ${filePath}: ${error.message}`
      );
      return "utf8";
    }
  }

  async readFileWithEncoding(filePath, encoding = "utf8") {
    try {
      const buffer = await fs.readFile(filePath);
      return iconv.decode(buffer, encoding);
    } catch (error) {
      this.logger.warn(`File read error for ${filePath}: ${error.message}`);
      return "";
    }
  }

  async filterFiles(basePath) {
    await this.loadGitignore(basePath);

    try {
      const files = await globby(["**/*"], {
        cwd: basePath,
        onlyFiles: true,
        absolute: true,
        ignore: this.baseExcludePatterns,
        dot: true,
        followSymbolicLinks: false,
      });

      const filteredFiles = await Promise.all(
        files.map(async (file) => {
          const relativePath = path.relative(basePath, file);

          if (this.ignoreFilter?.ignores(relativePath)) {
            return null;
          }

          try {
            const stats = await fs.stat(file);

            if (stats.size > this.maxFileSize) {
              return null;
            }

            const mimeType = mime.lookup(file);
            const isMimeText =
              typeof mimeType === "string" &&
              (mimeType.startsWith("text/") ||
                mimeType === "application/json" ||
                mimeType === "application/javascript" ||
                mimeType === "application/xml");

            return isMimeText ? file : null;
          } catch (error) {
            this.logger.warn(`Error checking file ${file}: ${error.message}`);
            return null;
          }
        })
      );

      return filteredFiles.filter(Boolean);
    } catch (error) {
      this.logger.error(`Error filtering files: ${error.message}`);
      return [];
    }
  }

  async convertRepository(repoPath, outputPath) {
    this.logger.info(`Processing repository: ${repoPath}`);

    const outputStream = fs.createWriteStream(outputPath, { encoding: "utf8" });
    outputStream.write(`# Repository: ${repoPath}\n`);
    outputStream.write("=".repeat(50) + "\n\n");

    const files = await this.filterFiles(repoPath);

    if (files.length === 0) {
      this.logger.warn("No valid files found to process");
      outputStream.write("No valid files found to process\n");
      outputStream.end();
      return;
    }

    const progressBar = new ProgressBar("Processing [:bar] :percent :etas", {
      complete: "=",
      incomplete: " ",
      width: 40,
      total: files.length,
    });

    for (const file of files) {
      try {
        const relativePath = path.relative(repoPath, file);
        const encoding = await this.detectFileEncoding(file);
        const content = await this.readFileWithEncoding(file, encoding);

        outputStream.write(`### SOURCE FILE: ${relativePath}\n`);
        outputStream.write("-".repeat(50) + "\n");
        outputStream.write(content + "\n\n");

        progressBar.tick();
      } catch (error) {
        this.logger.warn(`Error processing ${file}: ${error.message}`);
      }
    }

    outputStream.end();
    this.logger.success(`Conversion complete. Output written to ${outputPath}`);
  }

  async cloneAndConvert(repoUrl, outputPath) {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), "totxt-"));

    try {
      this.logger.info(`Cloning repository: ${repoUrl}`);
      await simpleGit().clone(repoUrl, tempDir);
      await this.convertRepository(tempDir, outputPath);
    } catch (error) {
      this.logger.error(`Cloning failed: ${error.message}`);
      throw error;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

class RepositoryStructureRecreator {
  constructor() {
    this.logger = this.createLogger();
  }

  createLogger() {
    return {
      info: (message) => console.log(chalk.blue(message)),
      success: (message) => console.log(chalk.green(message)),
      warn: (message) => console.warn(chalk.yellow(message)),
      error: (message) => console.error(chalk.red(message)),
    };
  }

  async generateStructureFromOutput(txtFile, basePath) {
    try {
      await fs.access(txtFile);

      const outputDir = path.join(basePath, path.basename(txtFile, ".txt"));
      await fs.ensureDir(outputDir);
      this.logger.info(`Creating structure in: ${outputDir}`);

      const fileContent = await fs.readFile(txtFile, "utf8");
      const lines = fileContent.split("\n");

      let currentFilePath = null;
      let currentFileContent = [];

      for (const line of lines) {
        if (line.startsWith("### SOURCE FILE:")) {
          if (currentFilePath) {
            await this.writeFile(
              outputDir,
              currentFilePath,
              currentFileContent
            );
          }
          currentFilePath = line.split("### SOURCE FILE:")[1].trim();
          currentFileContent = [];
        } else if (currentFilePath) {
          if (!line.startsWith("----") && line.trim()) {
            currentFileContent.push(line);
          }
        }
      }

      if (currentFilePath) {
        await this.writeFile(outputDir, currentFilePath, currentFileContent);
      }

      this.logger.success(`Structure recreated successfully in ${outputDir}`);
    } catch (error) {
      this.logger.error(`Error recreating structure: ${error.message}`);
      process.exit(1);
    }
  }

  async writeFile(outputDir, filePath, content) {
    const fullPath = path.join(outputDir, filePath);

    try {
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content.join("\n"));
      this.logger.info(`Created file: ${fullPath}`);
    } catch (error) {
      this.logger.warn(`Could not create file ${fullPath}: ${error.message}`);
    }
  }
}

program
  .name("totxt")
  .description("Convert repository to text and recreate structure")
  .version("1.0.0");

program
  .command("create")
  .description("Convert repository to text file")
  .argument("<repo-path>", "Local path or GitHub repository URL")
  .option("-m, --max-size <size>", "Maximum file size in KB", "100")
  .option("-o, --output <filename>", "Custom output filename")
  .action(async (repoPath, options) => {
    const converter = new RepositoryConverter({
      maxFileSize: parseInt(options.maxSize),
    });

    const outputFile =
      options.output ||
      `${path.basename(repoPath).replace(/[^a-z0-9]/gi, "_")}_output.txt`;

    try {
      if (repoPath.includes("github.com")) {
        await converter.cloneAndConvert(repoPath, outputFile);
      } else {
        await converter.convertRepository(repoPath, outputFile);
      }
    } catch (error) {
      console.error("Conversion failed:", error);
      process.exit(1);
    }
  });

program
  .command("recreate")
  .description("Recreate repository structure from text file")
  .argument("<txt-file>", "Text file containing repository contents")
  .option(
    "-b, --base-path <path>",
    "Base path where structure will be created",
    "."
  )
  .action(async (txtFile, options) => {
    const recreator = new RepositoryStructureRecreator();
    await recreator.generateStructureFromOutput(txtFile, options.basePath);
  });

program.parse(process.argv);
