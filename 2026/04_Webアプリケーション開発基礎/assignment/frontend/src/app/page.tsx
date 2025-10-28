"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

const Home = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const hasTodos = todos.length > 0;
  const incompleteTodos = useMemo(
    () => todos.filter((todo) => !todo.completed),
    [todos],
  );
  const completedTodos = useMemo(
    () => todos.filter((todo) => todo.completed),
    [todos],
  );

  useEffect(() => {
    const fetchTodos = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/todos", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("ToDoの取得に失敗しました");
        }
        const data: Todo[] = await res.json();
        setTodos(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラーです";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchTodos();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("タイトルを入力してください");
      return;
    }
    try {
      setError(null);
      const res = await fetch("/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        throw new Error("ToDoの追加に失敗しました");
      }
      const todo: Todo = await res.json();
      setTodos((prev) => [...prev, todo]);
      setTitle("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラーです";
      setError(message);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      setError(null);
      const res = await fetch(`/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      if (!res.ok) {
        throw new Error("ToDoの更新に失敗しました");
      }
      const updated: Todo = await res.json();
      setTodos((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラーです";
      setError(message);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      setError(null);
      const res = await fetch(`/todos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("ToDoの削除に失敗しました");
      }
      setTodos((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditingTitle("");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラーです";
      setError(message);
    }
  };

  const startEdit = (todo: Todo) => {
    setError(null);
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const saveEdit = async (id: number) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setError("タイトルを入力してください");
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        throw new Error("ToDoの更新に失敗しました");
      }
      const updated: Todo = await res.json();
      setTodos((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      cancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラーです";
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">シンプルToDo</h1>
          <p className="text-sm text-slate-600">
            やることを追加して完了チェックを付けることができます。
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            type="text"
            placeholder="やることを入力"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:bg-blue-300"
            disabled={loading}
          >
            追加
          </button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="rounded border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-500">読み込み中...</p>
          ) : !hasTodos ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              登録されたToDoはありません。
            </p>
          ) : (
            <div className="flex flex-col">
              <section className="border-b border-slate-200 px-4 py-4">
                <h2 className="text-sm font-semibold text-slate-600">
                  未完了
                </h2>
                {incompleteTodos.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    未完了のToDoはありません。
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-200">
                    {incompleteTodos.map((todo) => (
                      <TodoListItem
                        key={todo.id}
                        todo={todo}
                        loading={loading}
                        editingId={editingId}
                        editingTitle={editingTitle}
                        onToggle={toggleTodo}
                        onStartEdit={startEdit}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onDelete={deleteTodo}
                        setEditingTitle={setEditingTitle}
                      />
                    ))}
                  </ul>
                )}
              </section>
              <section className="px-4 py-4">
                <h2 className="text-sm font-semibold text-slate-600">
                  完了済み
                </h2>
                {completedTodos.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    完了済みのToDoはありません。
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-200">
                    {completedTodos.map((todo) => (
                      <TodoListItem
                        key={todo.id}
                        todo={todo}
                        loading={loading}
                        editingId={editingId}
                        editingTitle={editingTitle}
                        onToggle={toggleTodo}
                        onStartEdit={startEdit}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onDelete={deleteTodo}
                        setEditingTitle={setEditingTitle}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;

type TodoListItemProps = {
  todo: Todo;
  loading: boolean;
  editingId: number | null;
  editingTitle: string;
  onToggle: (todo: Todo) => void;
  onStartEdit: (todo: Todo) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  setEditingTitle: (value: string) => void;
};

const TodoListItem = ({
  todo,
  loading,
  editingId,
  editingTitle,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  setEditingTitle,
}: TodoListItemProps) => {
  const isEditing = editingId === todo.id;

  return (
    <li className="flex items-start justify-between py-3">
      <div className="flex flex-1 items-center gap-3">
        <button
          className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:bg-red-50 disabled:text-red-200"
          onClick={() => onDelete(todo.id)}
          disabled={loading}
        >
          削除
        </button>
        {isEditing ? (
          <input
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            value={editingTitle}
            onChange={(event) => setEditingTitle(event.target.value)}
            disabled={loading}
          />
        ) : (
          <span
            className={`flex-1 text-sm ${
              todo.completed ? "text-slate-400 line-through" : "text-slate-800"
            }`}
          >
            {todo.title}
          </span>
        )}
      </div>
      <div className="ml-4 flex items-center gap-2">
        {isEditing ? (
          <>
            <button
              className="rounded border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:bg-blue-100 disabled:text-blue-300"
              onClick={() => onSaveEdit(todo.id)}
              disabled={loading}
            >
              保存
            </button>
            <button
              className="rounded border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-300"
              onClick={onCancelEdit}
              disabled={loading}
            >
              キャンセル
            </button>
          </>
        ) : (
          <button
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-300"
            onClick={() => onToggle(todo)}
            disabled={loading}
          >
            {todo.completed ? "未完了" : "完了"}
          </button>
        )}
        {!isEditing && (
          <button
            className="rounded border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:bg-blue-100 disabled:text-blue-300"
            onClick={() => onStartEdit(todo)}
            disabled={loading}
          >
            編集
          </button>
        )}
      </div>
    </li>
  );
}
