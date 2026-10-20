"""Text extraction for the ATS proxies: PyMuPDF and pdfminer.six on one PDF.

    python extract.py pymupdf|pdfminer <file.pdf>

Prints the text to stdout with a form feed between pages. These are the parsers
many ATS products and CV parsers are built on, so a CV that extracts cleanly
here reads cleanly there.
"""
import sys


def pymupdf_text(path: str) -> str:
    import fitz  # PyMuPDF

    with fitz.open(path) as doc:
        # The default call every pipeline makes: text blocks in the order the file stores them.
        return "\f".join(page.get_text("text") for page in doc)


def pdfminer_text(path: str) -> str:
    from pdfminer.high_level import extract_text

    # extract_text separates pages with a form feed already.
    return extract_text(path)


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("pymupdf", "pdfminer"):
        sys.exit("usage: extract.py pymupdf|pdfminer <file.pdf>")
    text = pymupdf_text(sys.argv[2]) if sys.argv[1] == "pymupdf" else pdfminer_text(sys.argv[2])
    sys.stdout.buffer.write(text.encode("utf-8"))


if __name__ == "__main__":
    main()
