# リファクタリングのヒント集

このファイルには、実装に困ったときに参考にできる具体的なコード例が含まれています。
まずは自分で考えて実装し、どうしても進まない場合にこのファイルを参照してください。

---

## Backend実装例

### Step 1: インターフェース設計

```go
// repository/todo.go
package repository

import "backend/model"

type TodoRepository interface {
    List() ([]model.Todo, error)
    Create(title string) (model.Todo, error)
    Update(id int, title *string, completed *bool) (model.Todo, error)
    Delete(id int) error
}
```

**ポイント**
- インターフェースで抽象化することで、実装の差し替えが容易に
- テスト時にモックを注入できる
- 将来的なDB対応への移行が簡単

---

### Step 2: Model層

データ構造体のみを定義します。

```go
// model/todo.go
package model

type Todo struct {
    ID        int    `json:"id"`
    Title     string `json:"title"`
    Completed bool   `json:"completed"`
}

type CreateTodoRequest struct {
    Title string `json:"title"`
}

type UpdateTodoRequest struct {
    Title     *string `json:"title"`
    Completed *bool   `json:"completed"`
}
```

---

### Step 3: Repository層

データの永続化・取得のみを担当します。

```go
// repository/todo_file.go
package repository

import (
    "encoding/json"
    "errors"
    "os"
    "path/filepath"
    "slices"
    "sync"
    "backend/model"
)

var ErrNotFound = errors.New("todo not found")

type todoFileRepository struct {
    sync.Mutex
    todos    []model.Todo
    nextID   int
    filePath string
}

func NewTodoFileRepository(filePath string) (TodoRepository, error) {
    repo := &todoFileRepository{
        filePath: filePath,
        nextID:   1,
    }
    if err := repo.load(); err != nil {
        return nil, err
    }
    return repo, nil
}

func (r *todoFileRepository) load() error {
    r.Lock()
    defer r.Unlock()

    if err := os.MkdirAll(filepath.Dir(r.filePath), 0o755); err != nil {
        return err
    }

    data, err := os.ReadFile(r.filePath)
    if errors.Is(err, os.ErrNotExist) || len(data) == 0 {
        r.todos = []model.Todo{}
        r.nextID = 1
        return nil
    }
    if err != nil {
        return err
    }

    if err := json.Unmarshal(data, &r.todos); err != nil {
        return err
    }

    maxID := 0
    for _, t := range r.todos {
        if t.ID > maxID {
            maxID = t.ID
        }
    }
    r.nextID = maxID + 1
    return nil
}

func (r *todoFileRepository) save() error {
    payload, err := json.MarshalIndent(r.todos, "", "  ")
    if err != nil {
        return err
    }
    return os.WriteFile(r.filePath, payload, 0o644)
}

func (r *todoFileRepository) findIndexByID(id int) int {
    return slices.IndexFunc(r.todos, func(t model.Todo) bool {
        return t.ID == id
    })
}

func (r *todoFileRepository) List() ([]model.Todo, error) {
    r.Lock()
    defer r.Unlock()

    copied := make([]model.Todo, len(r.todos))
    copy(copied, r.todos)
    return copied, nil
}

func (r *todoFileRepository) Create(title string) (model.Todo, error) {
    r.Lock()
    defer r.Unlock()

    todo := model.Todo{ID: r.nextID, Title: title}
    r.nextID++
    r.todos = append(r.todos, todo)

    if err := r.save(); err != nil {
        return model.Todo{}, err
    }

    return todo, nil
}

func (r *todoFileRepository) Update(id int, title *string, completed *bool) (model.Todo, error) {
    r.Lock()
    defer r.Unlock()

    idx := r.findIndexByID(id)
    if idx == -1 {
        return model.Todo{}, ErrNotFound
    }

    if title != nil {
        r.todos[idx].Title = *title
    }
    if completed != nil {
        r.todos[idx].Completed = *completed
    }

    if err := r.save(); err != nil {
        return model.Todo{}, err
    }

    return r.todos[idx], nil
}

func (r *todoFileRepository) Delete(id int) error {
    r.Lock()
    defer r.Unlock()

    idx := r.findIndexByID(id)
    if idx == -1 {
        return ErrNotFound
    }

    r.todos = append(r.todos[:idx], r.todos[idx+1:]...)
    return r.save()
}
```

---

### Step 4: Service層

ビジネスロジックとバリデーションを担当します。

```go
// service/todo.go
package service

import (
    "errors"
    "backend/model"
    "backend/repository"
)

type TodoService struct {
    repo repository.TodoRepository
}

func NewTodoService(repo repository.TodoRepository) *TodoService {
    return &TodoService{repo: repo}
}

func (s *TodoService) ListTodos() ([]model.Todo, error) {
    return s.repo.List()
}

func (s *TodoService) CreateTodo(title string) (model.Todo, error) {
    // バリデーション
    if title == "" {
        return model.Todo{}, errors.New("title is required")
    }

    return s.repo.Create(title)
}

func (s *TodoService) UpdateTodo(id int, req model.UpdateTodoRequest) (model.Todo, error) {
    // バリデーション
    if req.Title != nil && *req.Title == "" {
        return model.Todo{}, errors.New("title is required")
    }

    return s.repo.Update(id, req.Title, req.Completed)
}

func (s *TodoService) DeleteTodo(id int) error {
    return s.repo.Delete(id)
}
```

---

### Step 5: Handler層

HTTPリクエスト/レスポンスの処理のみを担当します。

```go
// handler/todo.go
package handler

import (
    "errors"
    "net/http"
    "strconv"

    "github.com/labstack/echo/v4"
    "backend/model"
    "backend/repository"
    "backend/service"
)

type TodoHandler struct {
    service *service.TodoService
}

func NewTodoHandler(service *service.TodoService) *TodoHandler {
    return &TodoHandler{service: service}
}

func (h *TodoHandler) ListTodos(c echo.Context) error {
    todos, err := h.service.ListTodos()
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, todos)
}

func (h *TodoHandler) CreateTodo(c echo.Context) error {
    var req model.CreateTodoRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
    }

    todo, err := h.service.CreateTodo(req.Title)
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }

    return c.JSON(http.StatusCreated, todo)
}

func (h *TodoHandler) UpdateTodo(c echo.Context) error {
    id, err := strconv.Atoi(c.Param("id"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
    }

    var req model.UpdateTodoRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
    }

    if req.Title == nil && req.Completed == nil {
        return echo.NewHTTPError(http.StatusBadRequest, "no fields to update")
    }

    todo, err := h.service.UpdateTodo(id, req)
    if err != nil {
        if errors.Is(err, repository.ErrNotFound) {
            return echo.NewHTTPError(http.StatusNotFound, "todo not found")
        }
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }

    return c.JSON(http.StatusOK, todo)
}

func (h *TodoHandler) DeleteTodo(c echo.Context) error {
    id, err := strconv.Atoi(c.Param("id"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
    }

    if err := h.service.DeleteTodo(id); err != nil {
        if errors.Is(err, repository.ErrNotFound) {
            return echo.NewHTTPError(http.StatusNotFound, "todo not found")
        }
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }

    return c.NoContent(http.StatusNoContent)
}
```

---

### Step 6: main.goでの依存性注入

```go
// main.go
package main

import (
    "path/filepath"

    "github.com/labstack/echo/v4"
    "github.com/labstack/echo/v4/middleware"

    "backend/handler"
    "backend/repository"
    "backend/service"
)

func main() {
    e := echo.New()
    e.Use(middleware.Logger())
    e.Use(middleware.Recover())
    e.Use(middleware.CORS())

    // 依存関係の組み立て (Dependency Injection)
    repo, err := repository.NewTodoFileRepository(filepath.Join("tmp", "todos.json"))
    if err != nil {
        e.Logger.Fatal(err)
    }

    svc := service.NewTodoService(repo)
    h := handler.NewTodoHandler(svc)

    // ルーティング設定
    e.GET("/todos", h.ListTodos)
    e.POST("/todos", h.CreateTodo)
    e.PATCH("/todos/:id", h.UpdateTodo)
    e.DELETE("/todos/:id", h.DeleteTodo)

    e.Logger.Fatal(e.Start(":8080"))
}
```

---

## Frontend実装例

### API層の抽出

```typescript
// api/todos.ts
export type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

export const todosApi = {
  async list(): Promise<Todo[]> {
    const res = await fetch("/todos", { cache: "no-store" });
    if (!res.ok) throw new Error("ToDoの取得に失敗しました");
    return res.json();
  },

  async create(title: string): Promise<Todo> {
    const res = await fetch("/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error("ToDoの追加に失敗しました");
    return res.json();
  },

  async update(id: number, data: { title?: string; completed?: boolean }): Promise<Todo> {
    const res = await fetch(`/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("ToDoの更新に失敗しました");
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await fetch(`/todos/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("ToDoの削除に失敗しました");
  },
};
```

---

### カスタムフック: useTodos

```typescript
// hooks/useTodos.ts
import { useState, useEffect } from "react";
import { todosApi, Todo } from "@/api/todos";

export const useTodos = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleError = (err: unknown) => {
    const message = err instanceof Error ? err.message : "不明なエラーです";
    setError(message);
  };

  useEffect(() => {
    const fetchTodos = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await todosApi.list();
        setTodos(data);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTodos();
  }, []);

  const createTodo = async (title: string) => {
    try {
      setError(null);
      const todo = await todosApi.create(title);
      setTodos((prev) => [...prev, todo]);
    } catch (err) {
      handleError(err);
    }
  };

  const updateTodo = async (id: number, data: { title?: string; completed?: boolean }) => {
    try {
      setError(null);
      const updated = await todosApi.update(id, data);
      setTodos((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      handleError(err);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      setError(null);
      await todosApi.delete(id);
      setTodos((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      handleError(err);
    }
  };

  return {
    todos,
    loading,
    error,
    createTodo,
    updateTodo,
    deleteTodo,
  };
};
```

---

### カスタムフック: useEditingState

```typescript
// hooks/useEditingState.ts
import { useState } from "react";

export const useEditingState = () => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startEdit = (id: number, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  return {
    editingId,
    editingTitle,
    setEditingTitle,
    startEdit,
    cancelEdit,
  };
};
```

---

## Atomic Design実装例

**注**: ここでは基本的なAtomsとMoleculesの例のみを示しています。
TodoItem、TodoList、TodoSection、TodoTemplateなどの他のコンポーネントは、
これらの基本パターンを参考に自分で設計してみてください。

### Atoms

```typescript
// components/atoms/Button.tsx
type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
};

export const Button = ({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button"
}: ButtonProps) => {
  const baseClass = "rounded px-4 py-2 text-sm font-semibold transition";
  const variantClasses = {
    primary: "bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-300",
    secondary: "border border-slate-300 text-slate-600 hover:bg-slate-100",
    danger: "border border-red-200 text-red-500 hover:bg-red-50 disabled:text-red-200"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClasses[variant]}`}
    >
      {children}
    </button>
  );
};
```

```typescript
// components/atoms/Input.tsx
type InputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export const Input = ({ value, onChange, placeholder, disabled }: InputProps) => {
  return (
    <input
      className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
};
```

---

### Molecules

```typescript
// components/molecules/TodoForm.tsx
import { useState, FormEvent } from "react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";

type TodoFormProps = {
  onSubmit: (title: string) => Promise<void>;
  loading: boolean;
};

export const TodoForm = ({ onSubmit, loading }: TodoFormProps) => {
  const [title, setTitle] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    await onSubmit(trimmed);
    setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={title}
        onChange={setTitle}
        placeholder="やることを入力"
        disabled={loading}
      />
      <Button type="submit" variant="primary" disabled={loading}>
        追加
      </Button>
    </form>
  );
};
```

---

これらの実装例は参考用です。まずは自分で設計・実装してみてください!
