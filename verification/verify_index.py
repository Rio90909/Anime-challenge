from playwright.sync_api import sync_playwright
import os

def check_page():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Using file:// protocol
        path = os.path.abspath("index.html")
        page.goto(f"file://{path}")

        print(f"Title: {page.title()}")

        # Take a screenshot
        page.screenshot(path="verification/verification.png")

        browser.close()

if __name__ == "__main__":
    check_page()
