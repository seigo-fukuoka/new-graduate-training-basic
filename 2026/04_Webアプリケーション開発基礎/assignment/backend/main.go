package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"sync"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Todo struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

type createTodoRequest struct {
	Title string `json:"title"`
}

type updateTodoRequest struct {
	Title     *string `json:"title"`     // 未指定とゼロ値の区別のためにポインタを使用
	Completed *bool   `json:"completed"` // 未指定とゼロ値の区別のためにポインタを使用
}

type todoStore struct {
	sync.Mutex
	todos    []Todo
	nextID   int
	filePath string
}

func newTodoStore(file string) (*todoStore, error) {
	s := &todoStore{filePath: file, nextID: 1}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *todoStore) load() error {
	s.Lock()
	defer s.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.filePath), 0o755); err != nil {
		return err
	}

	data, err := os.ReadFile(s.filePath)
	if errors.Is(err, os.ErrNotExist) || len(data) == 0 {
		s.todos = []Todo{}
		s.nextID = 1
		return nil
	}
	if err != nil {
		return err
	}

	if err := json.Unmarshal(data, &s.todos); err != nil {
		return err
	}

	maxID := 0
	for _, t := range s.todos {
		if t.ID > maxID {
			maxID = t.ID
		}
	}
	s.nextID = maxID + 1

	return nil
}

func (s *todoStore) save() error {
	payload, err := json.MarshalIndent(s.todos, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, payload, 0o644)
}

func (s *todoStore) findIndexByID(id int) int {
	return slices.IndexFunc(s.todos, func(t Todo) bool {
		return t.ID == id
	})
}

func (s *todoStore) list() []Todo {
	s.Lock()
	defer s.Unlock()

	copied := make([]Todo, len(s.todos))
	copy(copied, s.todos)
	return copied
}

func (s *todoStore) create(title string) (Todo, error) {
	if title == "" {
		return Todo{}, errors.New("title is required")
	}

	s.Lock()
	defer s.Unlock()

	todo := Todo{ID: s.nextID, Title: title}
	s.nextID++
	s.todos = append(s.todos, todo)

	if err := s.save(); err != nil {
		return Todo{}, err
	}

	return todo, nil
}

func (s *todoStore) update(id int, req updateTodoRequest) (Todo, error) {
	s.Lock()
	defer s.Unlock()

	idx := s.findIndexByID(id)
	if idx == -1 {
		return Todo{}, echo.ErrNotFound
	}

	if req.Title != nil {
		if *req.Title == "" {
			return Todo{}, errors.New("title is required")
		}
		s.todos[idx].Title = *req.Title
	}
	if req.Completed != nil {
		s.todos[idx].Completed = *req.Completed
	}

	if err := s.save(); err != nil {
		return Todo{}, err
	}

	return s.todos[idx], nil
}

func (s *todoStore) delete(id int) error {
	s.Lock()
	defer s.Unlock()

	idx := s.findIndexByID(id)
	if idx == -1 {
		return echo.ErrNotFound
	}

	s.todos = append(s.todos[:idx], s.todos[idx+1:]...)
	return s.save()
}

func main() {
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	store, err := newTodoStore(filepath.Join("tmp", "todos.json"))
	if err != nil {
		e.Logger.Fatal(err)
	}

	e.GET("/todos", func(c echo.Context) error {
		return c.JSON(http.StatusOK, store.list())
	})

	e.POST("/todos", func(c echo.Context) error {
		var req createTodoRequest
		if err := c.Bind(&req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
		}

		todo, err := store.create(req.Title)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}

		return c.JSON(http.StatusCreated, todo)
	})

	e.PATCH("/todos/:id", func(c echo.Context) error {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
		}

		var req updateTodoRequest
		if err := c.Bind(&req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
		}

		if req.Title == nil && req.Completed == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "no fields to update")
		}

		todo, err := store.update(id, req)
		if err != nil {
			if errors.Is(err, echo.ErrNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "todo not found")
			}
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		return c.JSON(http.StatusOK, todo)
	})

	e.DELETE("/todos/:id", func(c echo.Context) error {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
		}

		if err := store.delete(id); err != nil {
			if errors.Is(err, echo.ErrNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "todo not found")
			}
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		return c.NoContent(http.StatusNoContent)
	})

	e.Logger.Fatal(e.Start(":8080"))
}
