# 課題: TODOアプリのアーキテクチャを考えよう

## このアプリについて

このリポジトリには、基本的なTODOアプリケーションが実装されています。

**主な機能**
- TODO項目の一覧表示
- 新しいTODO項目の追加
- TODO項目のタイトル編集
- 完了/未完了の切り替え
- TODO項目の削除

**技術構成**
- Backend: Go + Echo (REST API)
- Frontend: Next.js + TypeScript
- データ保存: JSONファイル

アプリは動作しますが、全てのコードが1つのファイルに集約されており、保守性・拡張性に課題があります。

## 課題の目的

現状の実装をレビューし、アーキテクチャパターンを適用してリファクタリングする課題です。

**必須課題: Backendのレイヤードアーキテクチャ実装**
**任意課題: Frontendのコンポーネント設計改善**

まずはBackendのリファクタリングに集中してください。

## 学習目標
この課題を通じて以下のスキルを習得します:

- **レイヤードアーキテクチャ**の理解と実装
- **単一責任原則(SRP)**の実践
- **依存性注入(DI)**パターンの習得
- **コンポーネント設計**の基礎
- **テスタブルな設計**の体感

---

# 環境構築

```bash
docker compose up --build
```

初回起動時、フロントエンドのビルドに数分かかります。

**アクセス**:
- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:8080

### 技術スタック

**Backend**
- Go 1.25.1
- Echo (Webフレームワーク)
- Air (ホットリロード)

**Frontend**
- Node.js 22 (Alpine)
- Next.js 15.5.0
- TypeScript
- Tailwind CSS

---

# 現状コードの課題

リファクタリングを始める前に、現在のコードの問題点を理解しましょう。

## Backend (backend/main.go)

❌ **問題点**

1. **全ロジックが1ファイルに集約** (233行)
   - HTTPハンドラー、ビジネスロジック、データアクセスが混在
   - ファイルが長く、理解が困難

2. **責務が分離されていない**
   - `todoStore` がデータアクセスとビジネスロジックを兼務
   - ハンドラー関数内にバリデーションロジックが散在 (main.go:104, 132)

3. **テストが書きづらい**
   - 依存関係がハードコーディング (main.go:167)
   - インターフェースによる抽象化がない

4. **エラーハンドリングが一貫していない**
   - `echo.ErrNotFound` と `errors.New` が混在 (main.go:128, 154)
   - 各ハンドラーで異なるエラー処理 (main.go:182-227)

5. **拡張性が低い**
   - ファイルストレージからDB切り替えが困難
   - 新機能追加時の影響範囲が広い

## Frontend (frontend/src/app/page.tsx)

❌ **問題点**

1. **巨大なコンポーネント** (352行)
   - 表示ロジック、状態管理、API通信が全て混在
   - 1つのコンポーネントが多くの責務を持つ

2. **API通信ロジックが散在**
   - fetch呼び出しが複数箇所に重複 (page.tsx:34, 60, 80, 101, 135)
   - エンドポイントURLがハードコード

3. **状態管理が複雑**
   - 6つのstateが並列に存在 (page.tsx:12-17)
   - 状態の関連性が不明瞭

4. **エラーハンドリングの重複**
   - 同じパターンが繰り返される (page.tsx:40-42, 71-73, 92-94)

5. **再利用性が低い**
   - ロジックが特定のコンポーネントに密結合
   - 他のページで同じ機能を使えない

---

# リファクタリング指針

## Backend: レイヤードアーキテクチャへの分離

### 目指す構造

```
backend/
├── handler/         # HTTPハンドラー (Presentation層)
│   └── todo.go
├── service/         # ビジネスロジック (Domain層)
│   └── todo.go
├── repository/      # データアクセス (Infrastructure層)
│   └── todo.go
├── model/           # データ構造体
│   └── todo.go
└── main.go          # エントリーポイント
```

### 実装手順

1. **Model層の作成**
   - `model/todo.go` にデータ構造体を定義
   - Todo, CreateTodoRequest, UpdateTodoRequest

2. **Repository層の作成**
   - `repository/todo.go` でインターフェースを定義
   - `repository/todo_file.go` で実装
   - 既存の `todoStore` のロジックを移植

3. **Service層の作成**
   - `service/todo.go` を作成
   - バリデーションとビジネスロジックを実装
   - Repositoryインターフェースを利用

4. **Handler層の作成**
   - `handler/todo.go` を作成
   - HTTPリクエスト/レスポンス処理のみ
   - Serviceを呼び出す

5. **main.goの整理**
   - 依存性注入パターンで各層を組み立て
   - ルーティング設定

**各層の責務**
- **Model**: データ構造のみ
- **Repository**: データの永続化・取得
- **Service**: ビジネスロジック・バリデーション
- **Handler**: HTTP処理

**詳細な実装例は [HINTS.md](./HINTS.md) を参照してください。**

---

## Frontend: Atomic Designによるコンポーネント設計

### 目指す構造 (Atomic Design)

```
frontend/src/
├── app/
│   └── page.tsx                    # Pages - メインページ
├── components/
│   ├── atoms/                      # Atoms - 最小単位のUI
│   │   ├── Button.tsx              # ボタン
│   │   ├── Input.tsx               # 入力フィールド
│   │   └── Text.tsx                # テキスト表示
│   ├── molecules/                  # Molecules - Atomsの組み合わせ
│   │   ├── TodoForm.tsx            # 入力フォーム (Input + Button)
│   │   └── TodoItem.tsx            # Todo項目 (Text + Buttons)
│   ├── organisms/                  # Organisms - 独立した機能ブロック
│   │   ├── TodoList.tsx            # Todo一覧
│   │   └── TodoSection.tsx         # セクション (タイトル + TodoList)
│   └── templates/                  # Templates - ページレイアウト
│       └── TodoTemplate.tsx        # Todoアプリのレイアウト
├── hooks/
│   ├── useTodos.ts                 # CRUD操作
│   └── useEditingState.ts          # 編集状態管理
└── api/
    └── todos.ts                    # API通信層
```

### Atomic Designとは

Brad Frostが提唱したデザインシステムの考え方で、UIを5つの階層に分類します:

- **Atoms (原子)**: ボタン、入力欄など、これ以上分割できない最小UI
- **Molecules (分子)**: Atomsを組み合わせた小さな機能単位
- **Organisms (有機体)**: Molecules/Atomsで構成された独立した機能ブロック
- **Templates (テンプレート)**: Organismsを配置したページ構造
- **Pages (ページ)**: 実際のデータを持つ完成したページ

**メリット**
- コンポーネントの再利用性が向上
- デザインシステムとして一貫性を保ちやすい
- 責務が明確で保守しやすい

### 実装アプローチ (任意課題)

Frontendは任意課題ですが、挑戦する場合は以下のアプローチから選択できます。

#### Option A: 基本的なリファクタリング

1. **API層の抽出**
   - `api/todos.ts` を作成
   - fetch呼び出しを集約

2. **カスタムフック化**
   - `hooks/useTodos.ts` でCRUD操作をカプセル化
   - 状態管理をコンポーネントから分離

3. **コンポーネント分割**
   - TodoForm, TodoList, TodoItem等に分割
   - page.tsxを簡素化

#### Option B: Atomic Design

より発展的なアプローチとして、Atomic Designパターンを適用できます。

1. **Atoms**: Button, Input, Text等の最小単位
2. **Molecules**: TodoForm, TodoItem等のAtomsの組み合わせ
3. **Organisms**: TodoList, TodoSection等の独立した機能ブロック
4. **Templates**: TodoTemplate等のページレイアウト
5. **Pages**: page.tsxでTemplateにデータを注入

**詳細な実装例は [HINTS.md](./HINTS.md) を参照してください。**

---

# 評価基準

## ✅ 必須課題 (Backend)

**Backend: レイヤードアーキテクチャの実装**
- [ ] 3層以上のレイヤー分離を実装
  - handler層: HTTPリクエスト/レスポンス処理
  - service層: ビジネスロジック
  - repository層: データアクセス
- [ ] インターフェースによる抽象化
- [ ] main.goでの依存性注入
- [ ] 各層のファイルが独立している

**目標**: main.goを100行以下に削減し、各層の責務を明確にする

---

## 🎯 任意課題 (Frontend)

以下は任意の発展課題です。時間に余裕がある場合に挑戦してください。

### Option A: 基本的なコンポーネント分割
- [ ] API層の独立 (api/todos.ts)
- [ ] カスタムフック化 (useTodos)
- [ ] 3つ以上のコンポーネント分割

### Option B: Atomic Design実装
- [ ] Atomic Designの階層構造
  - Atoms, Molecules, Organisms, Templates
- [ ] page.tsxを100行以下に削減
- [ ] デザインシステムとしての一貫性

### Option C: 状態管理の最適化
- [ ] useReducerによる状態管理
- [ ] Context APIの導入
- [ ] 複雑な状態ロジックの整理

---

## 🚀 発展課題 (共通)

余力がある場合のチャレンジ項目:
- [ ] ユニットテストの追加
- [ ] エラーハンドリングの統一
- [ ] DB対応への拡張準備
- [ ] E2Eテスト実装

---

# 参考資料

## Backend

### レイヤードアーキテクチャ
- [クリーンアーキテクチャ](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Go標準レイアウト](https://github.com/golang-standards/project-layout)

### Go設計パターン
- [Echo公式ドキュメント](https://echo.labstack.com/)
- [Goにおける依存性注入](https://go.dev/blog/wire)

## Frontend

### Atomic Design
- [Atomic Design公式解説](https://atomicdesign.bradfrost.com/)
- [Atomic Designを分かりやすく解説](https://design.dena.com/design/atomic-design-%E3%82%92%E5%88%86%E3%81%8B%E3%81%A3%E3%81%9F%E3%81%A4%E3%82%82%E3%82%8A%E3%81%AB%E3%81%AA%E3%82%8B)

### React設計
- [Reactコンポーネント設計原則](https://react.dev/learn/thinking-in-react)
- [カスタムフックのベストプラクティス](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Next.js
- [Next.jsプロジェクト構成](https://nextjs.org/docs/app/getting-started/project-structure)
- [App Routerガイド](https://nextjs.org/docs/app)

---

# ヒント

## つまずきやすいポイント

### Q: どこから手をつければいい?

**A: Backend必須課題から段階的に進めましょう**

1. `model/todo.go` でデータ構造を定義
2. `repository/todo.go` でインターフェースを定義
3. 既存の `todoStore` を `repository/todo_file.go` として移行
4. `service/todo.go` でビジネスロジックを抽出
5. `handler/todo.go` でHTTPハンドラーを分離
6. `main.go` を整理して依存性注入

**詳しい実装例が必要な場合は [HINTS.md](./HINTS.md) を参照してください。**

### Q: 既存のコードは全部書き直す?

**A: いいえ、段階的にリファクタリングします**

例: Backendのハンドラー移行
1. まず1つのエンドポイント (例: GET /todos) を新構造に移行
2. 動作確認 (curl やブラウザでテスト)
3. 問題なければ次のエンドポイントへ
4. 全て移行できたら古いコードを削除

### Q: テストは必須?

**A: 必須ではありませんが、テスト容易性を意識しましょう**

レイヤー分離の利点の1つは「テストが書きやすくなる」ことです。
各層を独立してテストできる設計になっているか確認してください。

テストコードの記述は任意ですが、「この設計ならテストが書けるか?」を考えることは重要です。

### Q: 完璧にリファクタリングできない場合は?

**A: まず必須項目を達成し、段階的に改善しましょう**

完璧を目指すより、まず動くコードで基本的なレイヤー分離を実現することが重要です。

### Q: Atomic Designのどの階層に分類すべきか迷う

**A: 判断基準を参考にしてください**

- **Atoms**: 他のコンポーネントに依存せず、単独で意味を持つ最小単位
  - 例: Button, Input, Text, Icon
- **Molecules**: 複数のAtomsを組み合わせた小さな機能単位
  - 例: 検索フォーム (Input + Button), ラベル付き入力欄 (Label + Input)
- **Organisms**: ビジネスロジックを持つ独立した機能ブロック
  - 例: ヘッダー、サイドバー、TodoList
- **Templates**: ページ全体のレイアウト構造
  - 例: 2カラムレイアウト、ダッシュボードテンプレート

迷ったら「このコンポーネントは他のページでも使えるか?」を考えましょう。
再利用性が高いほど下位の階層(Atoms/Molecules)に分類されます。

---

# 提出方法

リファクタリング完了後、PRに以下を含めてください:

1. **リファクタリング後のコード**
2. **変更内容の説明**
   - 何をどう改善したか
   - どのようなアーキテクチャパターンを適用したか
3. **工夫した点・学んだ点**
   - 設計で悩んだポイント
   - 今回の学びや気づき

## PR説明のテンプレート例

```markdown
## 概要
TODOアプリBackendのレイヤードアーキテクチャ実装を行いました。

## 変更内容

### Backend (必須課題)
- レイヤードアーキテクチャの適用
  - model層: データ構造の定義
  - repository層: データアクセスの実装
  - service層: ビジネスロジックの実装
  - handler層: HTTPハンドラーの実装
- 依存性注入パターンの実装
- main.goを233行 → XX行に削減

### Frontend (任意課題) ※取り組んだ場合のみ記載
- API層の独立化
- カスタムフック化
- コンポーネント分割

## 工夫した点
- インターフェース設計で将来のDB対応を考慮
- 各層の責務を明確に分離
- (その他工夫したこと)

## 学んだこと
- レイヤー分離により、各層が独立してテスト可能になることを理解
- 責務を明確にすることで、コードの見通しが大幅に改善
- (その他気づきや学び)

## 苦労した点・疑問点
- (あれば記載)
```
