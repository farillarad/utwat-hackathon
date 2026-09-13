import os
import time
import unittest

from playwright.sync_api import expect, sync_playwright


class ResultsUITest(unittest.TestCase):
    def setUp(self):
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=True)
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 1000})
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.runs = []
        self.offline = False
        self.page.route("**/api/results", self.feed)
        self.page.route("**/results.json", lambda route: route.fulfill(json=[]))
        self.page.goto(os.environ.get("SCOREBOARD_URL", "http://localhost:5174"))
        expect(self.page.get_by_role("button", name="Explore the demo", exact=True)).to_be_visible()
        self.fixture = self.page.evaluate("async () => (await import('/src/lib/benchmark.ts')).DEMO_RUNS[0]")

    def tearDown(self):
        self.browser.close()
        self.playwright.stop()
        self.assertEqual(self.errors, [])

    def feed(self, route):
        if self.offline:
            route.abort()
        else:
            route.fulfill(json=self.runs)

    def new_run(self, **overrides):
        started = int(time.time() * 1000)
        return {
            **self.fixture,
            "run_id": "recorded-browser-use-1-off",
            "model": "test-model",
            "started_at": started,
            "resolved_at": started + 100,
            "claimed_at": started + 100,
            **overrides,
        }

    def results(self):
        self.page.get_by_role("button", name="Results", exact=True).click()
        return self.page.get_by_role("dialog", name="The confidence gap")

    def delay_polling(self):
        self.page.add_init_script("""(() => {
            const schedule = window.setTimeout.bind(window);
            window.setTimeout = (callback, delay, ...args) => schedule(callback, delay === 2000 ? 60000 : delay, ...args);
        })();""")
        self.page.reload()
        expect(self.page.get_by_role("button", name="Live · 0 runs", exact=True)).to_be_visible()

    def test_opening_results_and_manual_refresh_fetch_without_waiting_for_poll(self):
        self.delay_polling()
        self.runs = [self.new_run(resolved_at=None, claimed_at=None, agent_claimed_success=False, ground_truth_success=False)]
        dialog = self.results()
        expect(dialog.get_by_label("Selected run result")).to_contain_text("Agent claim: pending")
        self.runs[0].update(resolved_at=int(time.time() * 1000), agent_claimed_success=True)
        dialog.get_by_role("button", name="Refresh now", exact=True).click()
        expect(dialog.get_by_label("Selected run result")).to_contain_text("False success")
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(1)

    def test_returning_to_browser_refreshes_results_without_waiting_for_poll(self):
        self.delay_polling()
        with self.page.expect_response("**/api/results"):
            dialog = self.results()
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(0)
        self.runs = [self.new_run()]
        self.page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(dialog.get_by_label("Selected run result")).to_contain_text("Verified success")
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(1)

    def test_demo_preview_does_not_create_results(self):
        self.page.get_by_role("button", name="Explore the demo", exact=True).click()
        dialog = self.results()
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(0)
        expect(dialog.get_by_text("No runs started this session yet.", exact=False)).to_be_visible()
        expect(dialog).not_to_contain_text("demo-browser-use")
        expect(dialog.locator(".cockpit-run-archive button")).to_have_count(0)
        dialog.get_by_role("button", name="History", exact=True).click()
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(0)

    def test_one_run_only_shows_its_agent_and_verification_setting(self):
        self.runs = [self.new_run()]
        self.page.reload()
        expect(self.page.get_by_label("Select agent")).to_have_value("browser-use")
        dialog = self.results()
        rows = dialog.locator(".cockpit-results-table tbody tr")
        expect(rows).to_have_count(1)
        expect(rows).to_contain_text("Browser Use")
        expect(rows).to_contain_text("1/1 runs")
        expect(rows.locator("td").first).to_have_text("OFF")
        expect(dialog).not_to_contain_text("Raw LLM Loop")
        expect(dialog.locator(".cockpit-run-archive button")).to_have_count(1)
        self.runs.append(self.new_run(run_id="second-agent-run", agent_name="raw-llm-loop"))
        expect(rows).to_have_count(2, timeout=10000)
        expect(dialog.locator(".cockpit-results-table")).to_contain_text("Raw LLM Loop")
        expect(dialog.locator(".cockpit-run-archive button")).to_have_count(2)

    def test_demo_cannot_override_live_updates_or_archive_selection(self):
        self.page.get_by_role("button", name="Explore the demo", exact=True).click()
        dialog = self.results()
        self.runs = [self.new_run(resolved_at=None, claimed_at=None, agent_claimed_success=False, ground_truth_success=False, steps_used=0)]
        rows = dialog.locator(".cockpit-results-table tbody tr")
        expect(rows).to_have_count(1, timeout=10000)
        expect(dialog.get_by_label("Selected run result")).to_contain_text("recorded-browser-use-1-off")
        expect(dialog.get_by_label("Selected run result")).to_contain_text("Agent claim: pending")
        expect(dialog).not_to_contain_text("demo-browser-use")
        self.runs[0].update(resolved_at=int(time.time() * 1000), agent_claimed_success=True)
        expect(dialog.get_by_label("Selected run result")).to_contain_text("False success", timeout=10000)
        expect(rows).to_contain_text("1/1 claims")
        dialog.get_by_label("Results scope").select_option("level")
        expect(rows).to_have_count(1)
        expect(dialog.get_by_label("Results scope").locator("option:checked")).to_contain_text("1")
        self.offline = True
        expect(dialog.get_by_role("status")).to_contain_text("stale", timeout=10000)
        expect(rows).to_have_count(1)
        dialog.locator(".cockpit-run-archive button").first.click()
        expect(dialog).not_to_be_visible()
        expect(self.page.get_by_role("group", name="Data source").get_by_role("button", name="Recorded", exact=True)).to_have_attribute("aria-pressed", "true")
        expect(self.results().get_by_label("Selected run result")).to_contain_text("recorded-browser-use-1-off")

    def test_history_is_separate_from_new_runs_even_during_demo(self):
        old = self.new_run(run_id="old-raw-run", agent_name="raw-llm-loop", started_at=1)
        self.runs = [old]
        self.page.reload()
        self.page.get_by_role("button", name="Explore the demo", exact=True).click()
        dialog = self.results()
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(0)
        dialog.get_by_role("button", name="History", exact=True).click()
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(1)
        expect(dialog.locator(".cockpit-results-table")).to_contain_text("Raw LLM Loop")
        expect(dialog).not_to_contain_text("demo-browser-use")
        dialog.get_by_role("button", name="This session", exact=True).click()
        expect(dialog.locator(".cockpit-results-table tbody tr")).to_have_count(0)


if __name__ == "__main__":
    unittest.main()
