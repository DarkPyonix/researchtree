import subprocess

from researchtree import cli, skill


def _repo(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    return tmp_path


def test_bundled_skill_has_frontmatter():
    text = skill.text()
    assert text.startswith("---\nname: researchtree\ndescription: ")
    assert "rt.load()" in text and "researchtree release" in text


def test_install_into_both_when_no_agent_folder(tmp_path, capsys):
    root = _repo(tmp_path)
    assert cli.main(["skill", "install", "--path", str(root)]) == 0
    for rel in (".claude/skills/researchtree/SKILL.md", ".agents/skills/researchtree/SKILL.md"):
        assert (root / rel).read_text(encoding="utf-8") == skill.text()
    assert "설치: .claude/skills/researchtree/SKILL.md" in capsys.readouterr().out


def test_install_follows_existing_folder_and_reports_state(tmp_path):
    root = _repo(tmp_path)
    (root / ".agents").mkdir()
    assert skill.default_targets(root) == ["agents"]
    path = root / ".agents/skills/researchtree/SKILL.md"
    assert skill.install(root, ["agents"]) == [(path, "installed")]
    assert skill.install(root, ["agents"]) == [(path, "unchanged")]
    path.write_text("old", encoding="utf-8")
    assert skill.install(root, ["agents"]) == [(path, "updated")]
    assert not (root / ".claude").exists()


def test_install_uses_repository_root_from_a_subdirectory(tmp_path, monkeypatch):
    root = _repo(tmp_path)
    (root / ".claude").mkdir()
    sub = root / "src" / "pkg"
    sub.mkdir(parents=True)
    monkeypatch.chdir(sub)
    assert cli.main(["skill", "install"]) == 0
    assert (root / ".claude/skills/researchtree/SKILL.md").is_file()
    assert not (sub / ".claude").exists()


def test_install_outside_git_needs_path(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    assert cli.main(["skill", "install"]) == 1
    assert cli.main(["skill", "install", "--path", str(tmp_path), "--target", "claude"]) == 0
    assert (tmp_path / ".claude/skills/researchtree/SKILL.md").is_file()
