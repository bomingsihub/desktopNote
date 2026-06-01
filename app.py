import sqlite3
import traceback
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox


APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "notes.db"
CRASH_LOG_PATH = APP_DIR / "crash.log"

TRANSPARENT_COLOR = "#010203"
PANEL_COLOR = "#8f887b"
HEADER_COLOR = "#81796d"
ROW_ACTIVE = "#7b7268"
LINE_COLOR = "#d4ccbd"
TEXT_COLOR = "#ffffff"
MUTED_TEXT = "#eee9dd"


class NoteRepository:
    def __init__(self, path: Path):
        self.path = path
        self.init_db()

    def connect(self):
        return sqlite3.connect(self.path)

    def init_db(self):
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    completed INTEGER NOT NULL DEFAULT 0,
                    pinned INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(pinned, updated_at)")

    def list_notes(self, keyword=""):
        with self.connect() as conn:
            conn.row_factory = sqlite3.Row
            if keyword:
                pattern = f"%{keyword}%"
                return conn.execute(
                    """
                    SELECT * FROM notes
                    WHERE title LIKE ? OR content LIKE ?
                    ORDER BY pinned DESC, completed ASC, updated_at DESC
                    """,
                    (pattern, pattern),
                ).fetchall()
            return conn.execute(
                """
                SELECT * FROM notes
                ORDER BY pinned DESC, completed ASC, updated_at DESC
                """
            ).fetchall()

    def create_note(self):
        now = datetime.now().isoformat(timespec="seconds")
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO notes (title, content, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                ("新便签", "", now, now),
            )
            return cursor.lastrowid

    def update_text(self, note_id, text):
        now = datetime.now().isoformat(timespec="seconds")
        title = text.strip() or "无标题"
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE notes
                SET title = ?, content = ?, updated_at = ?
                WHERE id = ?
                """,
                (title, text.strip(), now, note_id),
            )

    def toggle_completed(self, note_id):
        now = datetime.now().isoformat(timespec="seconds")
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE notes
                SET completed = CASE completed WHEN 1 THEN 0 ELSE 1 END,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, note_id),
            )

    def toggle_pinned(self, note_id):
        now = datetime.now().isoformat(timespec="seconds")
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE notes
                SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, note_id),
            )

    def delete_note(self, note_id):
        with self.connect() as conn:
            conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))

    def clear_completed(self):
        with self.connect() as conn:
            conn.execute("DELETE FROM notes WHERE completed = 1")


class DesktopNotesApp(tk.Tk):
    MIN_WIDTH = 360
    MIN_HEIGHT = 360

    def __init__(self):
        super().__init__()
        self.repo = NoteRepository(DB_PATH)
        self.notes = []
        self.keyword = tk.StringVar()
        self.selected_id = None
        self.drag_origin = None
        self.resize_origin = None
        self.row_boxes = {}
        self.button_boxes = {}
        self.edit_entry = None
        self.search_entry = None

        self.title("透明桌面便签")
        self.geometry("430x510+180+120")
        self.minsize(self.MIN_WIDTH, self.MIN_HEIGHT)
        self.configure(bg=TRANSPARENT_COLOR)
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self._enable_transparent_background()

        self.canvas = tk.Canvas(
            self,
            bg=TRANSPARENT_COLOR,
            highlightthickness=0,
            bd=0,
            cursor="arrow",
        )
        self.canvas.pack(fill="both", expand=True)

        self.menu = tk.Menu(self, tearoff=False, bg="#f5f1e8", fg="#333333")
        self.menu.add_command(label="新建便签", command=self.add_note)
        self.menu.add_command(label="置顶/取消置顶", command=self.toggle_selected_pin)
        self.menu.add_command(label="删除当前便签", command=self.delete_selected)
        self.menu.add_separator()
        self.menu.add_command(label="清空已完成", command=self.clear_completed)
        self.menu.add_command(label="退出", command=self.destroy)

        self.keyword.trace_add("write", lambda *_: self.reload())
        self.bind_events()
        self.reload()
        if not self.notes:
            self.add_note()

    def _enable_transparent_background(self):
        try:
            self.wm_attributes("-transparentcolor", TRANSPARENT_COLOR)
        except tk.TclError:
            self.attributes("-alpha", 0.01)

    def bind_events(self):
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<Double-Button-1>", self.on_double_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Configure>", lambda _event: self.draw())
        self.bind("<Escape>", lambda _event: self.finish_edit())
        self.bind("<Control-n>", lambda _event: self.add_note())
        self.bind("<Control-f>", lambda _event: self.show_search())
        self.bind("<Control-s>", lambda _event: self.finish_edit())
        self.bind("<Delete>", lambda _event: self.delete_selected())

    def reload(self, keep_selected=True):
        current = self.selected_id if keep_selected else None
        self.notes = self.repo.list_notes(self.keyword.get().strip())
        if current and any(note["id"] == current for note in self.notes):
            self.selected_id = current
        elif self.notes:
            self.selected_id = self.notes[0]["id"]
        else:
            self.selected_id = None
        self.draw()

    def draw(self):
        self.canvas.delete("all")
        self.row_boxes.clear()
        self.button_boxes.clear()

        width = max(self.winfo_width(), self.MIN_WIDTH)
        height = max(self.winfo_height(), self.MIN_HEIGHT)
        pad = 0
        header_h = 48
        footer_h = 32

        self.canvas.create_line(0, header_h, width, header_h, fill=LINE_COLOR, stipple="gray50")

        self.draw_toolbar(width, header_h)
        self.draw_rows(width, height, header_h, footer_h)
        self.draw_footer(width, height, footer_h)

    def draw_toolbar(self, width, header_h):
        y = header_h // 2
        self.button_boxes["all"] = (13, 9, 84, 39)
        self.canvas.create_text(24, y, text="□", fill=TEXT_COLOR, font=("Segoe UI", 15), anchor="w")
        self.canvas.create_text(44, y, text="全部", fill=TEXT_COLOR, font=("Microsoft YaHei UI", 12), anchor="w")

        buttons = [
            ("search", "⌕", width - 210),
            ("add", "+", width - 166),
            ("pin", "☆", width - 124),
            ("min", "−", width - 82),
            ("menu", "☰", width - 42),
        ]
        for key, label, x in buttons:
            self.button_boxes[key] = (x - 15, 8, x + 17, 40)
            self.canvas.create_text(
                x,
                y,
                text=label,
                fill=TEXT_COLOR,
                font=("Segoe UI", 21 if key == "add" else 17),
                anchor="center",
            )

    def draw_rows(self, width, height, header_h, footer_h):
        top = header_h
        row_h = 62
        bottom = height - footer_h
        if not self.notes:
            self.canvas.create_text(
                width / 2,
                top + 85,
                text="点击 + 新建便签",
                fill=MUTED_TEXT,
                font=("Microsoft YaHei UI", 13, "bold"),
                anchor="center",
            )
            return

        for index, note in enumerate(self.notes):
            y1 = top + index * row_h
            y2 = y1 + row_h
            if y1 >= bottom:
                break

            if note["id"] == self.selected_id:
                self.canvas.create_rectangle(
                    3,
                    y1 + 2,
                    width - 3,
                    y2 - 2,
                    outline=LINE_COLOR,
                    width=1,
                    stipple="gray50",
                )

            self.canvas.create_line(12, y2, width - 8, y2, fill=LINE_COLOR, stipple="gray50")

            check_x = 22
            check_y = y1 + 24
            self.canvas.create_rectangle(
                check_x - 8,
                check_y - 8,
                check_x + 8,
                check_y + 8,
                outline=TEXT_COLOR,
                width=1,
            )
            if note["completed"]:
                self.canvas.create_line(
                    check_x - 5,
                    check_y,
                    check_x - 1,
                    check_y + 5,
                    check_x + 7,
                    check_y - 6,
                    fill=TEXT_COLOR,
                    width=2,
                )

            prefix = "★ " if note["pinned"] else ""
            title = (note["title"] or "无标题").replace("\n", " ")
            if len(title) > 33:
                title = f"{title[:32]}…"

            font = ("Microsoft YaHei UI", 12, "bold")
            fill = MUTED_TEXT if note["completed"] else TEXT_COLOR
            self.canvas.create_text(50, y1 + 24, text=prefix + title, fill=fill, font=font, anchor="w")

            if note["content"] and note["content"] != note["title"]:
                content = note["content"].replace("\n", " ")
                if len(content) > 44:
                    content = f"{content[:43]}…"
                self.canvas.create_text(
                    50,
                    y1 + 47,
                    text=content,
                    fill=MUTED_TEXT,
                    font=("Microsoft YaHei UI", 9),
                    anchor="w",
                )

            more_x = width - 25
            self.canvas.create_text(
                more_x,
                y1 + 24,
                text="⋮",
                fill=TEXT_COLOR,
                font=("Segoe UI", 18, "bold"),
                anchor="center",
            )
            self.row_boxes[note["id"]] = {
                "row": (0, y1, width, y2),
                "check": (check_x - 12, check_y - 12, check_x + 12, check_y + 12),
                "more": (more_x - 18, y1 + 6, more_x + 18, y1 + 42),
                "edit": (48, y1 + 7, width - 52, y1 + 43),
            }

    def draw_footer(self, width, height, footer_h):
        y = height - footer_h
        count_text = str(len(self.notes))
        self.canvas.create_text(
            16,
            y + 17,
            text=count_text,
            fill=MUTED_TEXT,
            font=("Microsoft YaHei UI", 11),
            anchor="w",
        )
        self.button_boxes["resize"] = (width - 32, height - 32, width, height)
        for offset in (6, 11, 16):
            self.canvas.create_line(
                width - offset,
                height - 4,
                width - 4,
                height - offset,
                fill=LINE_COLOR,
            )

    def on_click(self, event):
        self.finish_edit()
        hit_button = self.hit_test(self.button_boxes, event.x, event.y)
        if hit_button:
            self.handle_toolbar(hit_button, event)
            return

        hit_note_id, part = self.hit_test_rows(event.x, event.y)
        if hit_note_id:
            self.selected_id = hit_note_id
            if part == "check":
                self.repo.toggle_completed(hit_note_id)
                self.reload()
            elif part == "more":
                self.show_note_menu(hit_note_id, event)
            else:
                self.draw()
            return

        if event.y <= 48:
            self.drag_origin = (event.x_root, event.y_root, self.winfo_x(), self.winfo_y())

    def on_double_click(self, event):
        note_id, part = self.hit_test_rows(event.x, event.y)
        if note_id and part in ("row", "edit"):
            self.selected_id = note_id
            self.start_edit(note_id)

    def on_drag(self, event):
        if self.resize_origin:
            start_x, start_y, start_w, start_h = self.resize_origin
            new_w = max(self.MIN_WIDTH, start_w + event.x_root - start_x)
            new_h = max(self.MIN_HEIGHT, start_h + event.y_root - start_y)
            self.geometry(f"{new_w}x{new_h}")
            return
        if self.drag_origin:
            start_x, start_y, win_x, win_y = self.drag_origin
            dx = event.x_root - start_x
            dy = event.y_root - start_y
            self.geometry(f"+{win_x + dx}+{win_y + dy}")

    def on_release(self, _event):
        self.drag_origin = None
        self.resize_origin = None

    def handle_toolbar(self, key, event):
        if key == "add":
            self.add_note()
        elif key == "search":
            self.show_search()
        elif key == "pin":
            self.toggle_selected_pin()
        elif key == "min":
            self.minimize()
        elif key == "menu":
            self.menu.tk_popup(event.x_root, event.y_root)
        elif key == "resize":
            self.resize_origin = (
                event.x_root,
                event.y_root,
                max(self.winfo_width(), self.MIN_WIDTH),
                max(self.winfo_height(), self.MIN_HEIGHT),
            )

    def hit_test(self, boxes, x, y):
        for key, box in boxes.items():
            x1, y1, x2, y2 = box
            if x1 <= x <= x2 and y1 <= y <= y2:
                return key
        return None

    def hit_test_rows(self, x, y):
        for note_id, boxes in self.row_boxes.items():
            for part in ("check", "more", "edit", "row"):
                x1, y1, x2, y2 = boxes[part]
                if x1 <= x <= x2 and y1 <= y <= y2:
                    return note_id, part
        return None, None

    def add_note(self):
        note_id = self.repo.create_note()
        self.selected_id = note_id
        self.reload()
        self.after(80, lambda: self.start_edit(note_id))

    def selected_note(self):
        for note in self.notes:
            if note["id"] == self.selected_id:
                return note
        return None

    def start_edit(self, note_id):
        self.finish_edit()
        boxes = self.row_boxes.get(note_id)
        note = next((item for item in self.notes if item["id"] == note_id), None)
        if not boxes or not note:
            return
        x1, y1, x2, y2 = boxes["edit"]
        self.edit_entry = tk.Entry(
            self,
            relief="flat",
            bg=TRANSPARENT_COLOR,
            fg=TEXT_COLOR,
            insertbackground=TEXT_COLOR,
            selectbackground="#7d7468",
            font=("Microsoft YaHei UI", 12, "bold"),
        )
        self.edit_entry.insert(0, note["title"])
        self.edit_entry.place(x=x1, y=y1, width=x2 - x1, height=y2 - y1)
        self.edit_entry.focus_set()
        self.edit_entry.selection_range(0, tk.END)
        self.edit_entry.bind("<Return>", lambda _event: self.finish_edit())
        self.edit_entry.bind("<FocusOut>", lambda _event: self.finish_edit())

    def finish_edit(self):
        if not self.edit_entry:
            return
        entry = self.edit_entry
        self.edit_entry = None
        text = entry.get()
        entry.destroy()
        if self.selected_id:
            self.repo.update_text(self.selected_id, text)
            self.reload()

    def show_search(self):
        self.finish_edit()
        if self.search_entry:
            self.search_entry.focus_set()
            return
        width = max(self.winfo_width(), self.MIN_WIDTH)
        self.search_entry = tk.Entry(
            self,
            textvariable=self.keyword,
            relief="flat",
            bg=TRANSPARENT_COLOR,
            fg=TEXT_COLOR,
            insertbackground=TEXT_COLOR,
            selectbackground="#7d7468",
            font=("Microsoft YaHei UI", 11),
        )
        self.search_entry.place(x=92, y=10, width=max(110, width - 315), height=28)
        self.search_entry.focus_set()
        self.search_entry.bind("<Escape>", lambda _event: self.hide_search(clear=True))
        self.search_entry.bind("<FocusOut>", lambda _event: self.hide_search(clear=False))

    def hide_search(self, clear=False):
        if clear:
            self.keyword.set("")
        if self.search_entry:
            self.search_entry.destroy()
            self.search_entry = None
            self.draw()

    def show_note_menu(self, note_id, event):
        self.selected_id = note_id
        note_menu = tk.Menu(self, tearoff=False, bg="#f5f1e8", fg="#333333")
        note_menu.add_command(label="编辑", command=lambda: self.start_edit(note_id))
        note_menu.add_command(label="置顶/取消置顶", command=lambda: self.toggle_pin(note_id))
        note_menu.add_command(label="删除", command=lambda: self.delete_note(note_id))
        note_menu.tk_popup(event.x_root, event.y_root)

    def toggle_selected_pin(self):
        if self.selected_id:
            self.toggle_pin(self.selected_id)

    def toggle_pin(self, note_id):
        self.repo.toggle_pinned(note_id)
        self.reload()

    def delete_selected(self):
        if self.selected_id:
            self.delete_note(self.selected_id)

    def delete_note(self, note_id):
        if not messagebox.askyesno("删除便签", "确定要删除当前便签吗？"):
            return
        self.repo.delete_note(note_id)
        self.reload(keep_selected=False)

    def clear_completed(self):
        if not messagebox.askyesno("清空已完成", "确定要删除所有已完成便签吗？"):
            return
        self.repo.clear_completed()
        self.reload(keep_selected=False)

    def minimize(self):
        self.overrideredirect(False)
        self.iconify()
        self.after(200, self.restore_borderless)

    def restore_borderless(self):
        if self.state() == "normal":
            self.overrideredirect(True)
        else:
            self.after(200, self.restore_borderless)


if __name__ == "__main__":
    try:
        app = DesktopNotesApp()
        app.mainloop()
    except Exception:
        CRASH_LOG_PATH.write_text(traceback.format_exc(), encoding="utf-8")
        raise
