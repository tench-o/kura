# kura Web UI 仕様書

## 概要

kura Web UI は `kura ui` コマンドで起動するローカルWebサーバーで、スプレッドシート風のテーブルビューとプロパティベースのレコード詳細を組み合わせた、直感的なデータベース操作インターフェース。

```
kura ui --db <name>       # localhost でブラウザが開く
kura ui --db <name> -p 4000  # ポート指定
```

## アーキテクチャ

```
Browser (SPA)
    ↕  HTTP/JSON
Hono Server (src/ui/server.ts)
    ↓
Core Layer (src/core/)
    ↓
SQLite
```

- CLI・MCP と同じ Core 層を利用する。UI 層にビジネスロジックを書かない
- Hono で API を提供し、ビルド済み SPA を静的ファイルとして同梱する
- SPA は React + Vite でビルドし、`dist/ui/` に出力する

## レイアウト

```
┌──────────┬──────────────────────────────────┐
│ Sidebar  │  Topbar (テーブル名 + Actions)   │
│          ├──────────────────────────────────┤
│ - tables │  Toolbar (Filter / Sort / Search)│
│ - actions├──────────────────────────────────┤
│          │                                  │
│          │  Table View (メインコンテンツ)    │
│          │                                  │
│          ├──────────────────────────────────┤
│          │  Statusbar (件数 / カラム数)      │
└──────────┴──────────────────────────────────┘
```

### Sidebar（左ペイン・固定幅 240px）

- **DB 名表示**: ヘッダーに kura ロゴ + DB 名（mono フォント）
- **テーブル一覧**: アイコン + テーブル名 + レコード数。クリックでテーブル切り替え
- **アクション**: Query / Import / Export
- **フッター**: DB ファイルパス表示

### Topbar

- テーブルアイコン + テーブル名（alias がある場合は alias を表示、元テーブル名をカッコ付きで補足表示）
- 右側: ⚙ 設定ボタン（テーブル設定モーダル）、CSV ダウンロードボタン、··· メニュー、＋ New ボタン（プライマリ）

### Toolbar

- Filter / Sort / Group ボタン
- 右端: リアルタイム検索ボックス（FTS5 を利用）

### Statusbar

- レコード数、カラム数を表示

## テーブルビュー

### 列ヘッダー

- カラム名（alias があれば alias を表示） + 型ラベル（text / int / real / bool / relation）
- リレーションカラムは `→ target_table` を表示
- ソートアイコン（クリックで昇順/降順切り替え）
- 列幅はドラッグでリサイズ可能
- 型ラベルクリックで **ColumnMenu** を表示（カラム名リネーム、alias 編集、display_type 変更）

### セル表示

セルの表示は `column_type`（ストレージ型）と `display_type`（表示型）の組み合わせで決定する。`display_type` が NULL の場合はストレージ型のデフォルト表示を使う。

#### ストレージ型ごとのデフォルト表示

| column_type  | デフォルト表示 |
|--------------|----------|
| text         | そのまま表示。空は `—` をグレーで表示 |
| int          | 右寄せ、mono フォント。数値そのまま |
| real         | 右寄せ、mono フォント。数値そのまま |
| bool         | チェックボックス |
| relation     | 青タグで参照先レコードの表示カラム値を表示。`↗` プレフィックス付き。クリックで参照先テーブルへ遷移 |
| relation[]   | 複数の青タグを横並び |

#### display_type による表示の上書き

| display_type | 表示方式 | 編集UI |
|---|---|---|
| `multiline` | 改行を保持して表示。セル内は省略し、モーダルで全文表示 | textarea |
| `url` | リンクテキストとして表示。クリックで別タブに開く | テキスト入力（URL バリデーション） |
| `email` | mailto リンクとして表示 | テキスト入力（email バリデーション） |
| `select` | カラータグで表示。色はテーブル内の出現順でパレットから自動割り当て | ドロップダウン（既存値一覧 + 新規入力） |
| `date` | 日付フォーマットで表示（YYYY-MM-DD） | 日付ピッカー |
| `phone` | tel リンクとして表示 | テキスト入力 |
| `currency` | `¥1,000,000` 形式で表示 | 数値入力 |
| `rating` | 星アイコン（1-5） | 星クリック |
| `percent` | `85.5%` 形式で表示 | 数値入力 |

#### 自動カラム（常に編集不可）

| カラム     | 表示 |
|-----------|------|
| id         | グレー、mono フォント |
| created_at | グレー、小さめフォント |
| updated_at | グレー、小さめフォント |

### セル編集（インライン）

- セルクリックで編集モードに入る
- blur または Enter で確定 → API 経由で `updateRecord` を呼ぶ
- Escape でキャンセル
- id / created_at / updated_at は編集不可
- 編集 UI は `display_type` に応じて切り替わる（上記「display_type による表示の上書き」の編集UI列を参照）
- relation カラムは `RelationInput` でインクリメンタルサーチ選択（300ms デバウンス、最大10件表示）
- relation[] カラムは `RelationArrayInput` でタグ表示 + インクリメンタルサーチ追加
- bool カラムはチェックボックスのトグル

### 行操作

- **行クリック**: レコード詳細モーダルを開く
- **＋ New（テーブル末尾）**: 新規レコード追加行。クリックで空レコードを作成
- **削除**: モーダル内の Delete ボタンから

## レコード詳細モーダル

### レイアウト

```
┌─────────────────────────────────────────┐
│ #id          タイトル（編集可能）     ✕  │
├─────────────────────────────────────────┤
│ プロパティ名    │ 値（編集可能）         │
│ position       │ [↗ Senior Backend...]  │
│ status         │ [契約済]               │
│ skill_sheet_url│ https://...            │
│ ...            │                        │
├─────────────────────────────────────────┤
│ created: 2026-02-16   updated: 2026-03-07│
└─────────────────────────────────────────┘
```

- テーブルの最初の text カラムをタイトルとして大きく表示（contenteditable）
- 各プロパティは「ラベル + 値」の横並び
- プロパティの型アイコン: `Aa`(text), `#`(int), `#.#`(real), `↗`(relation), `◉`(select), `🔗`(url), `📅`(date), `⭐`(rating)
- 値のホバーで背景ハイライト、クリックで編集
- Escape でモーダルを閉じる

## select タグの色分け

`display_type: select` のカラムはタグ表示される。テーブルごとに固有の色マッピングは持たず、値の出現順に以下のパレットを割り当てる:

| 順番 | 背景色 |
|------|--------|
| 1 | blue   |
| 2 | green  |
| 3 | orange |
| 4 | purple |
| 5 | yellow |
| 6 | red    |
| 7 | gray   |

同一テーブル内で同じ値には同じ色が割り当てられる。7色を超えた場合はパレットを循環する。

## 数値表示ルール

- `display_type` が NULL の int / real はそのまま数値表示する
- `currency` なら通貨フォーマット、`percent` ならパーセント表示、`rating` なら星表示
- UI がカラム名から表示フォーマットを推測することはしない。必ず `display_type` に従う

## フィルター

- Toolbar の Filter ボタンで条件行を表示
- カラム選択 → 演算子選択 → 値入力
- 複数条件は AND で結合
- 内部的には `listRecords` の `filters` パラメータに変換

### Date型カラムのフィルター

`displayType === "date"` のカラムは専用UIを表示する。

**オペレータ一覧:**

| オペレータ | ラベル | 入力UI | バックエンド送信 |
|-----------|--------|--------|----------------|
| `eq` | is | `<input type="date">` × 1 | そのまま |
| `neq` | is not | `<input type="date">` × 1 | そのまま |
| `gt` | after | `<input type="date">` × 1 | そのまま |
| `lt` | before | `<input type="date">` × 1 | そのまま |
| `gte` | on or after | `<input type="date">` × 1 | そのまま |
| `lte` | on or before | `<input type="date">` × 1 | そのまま |
| `between` | is between | `<input type="date">` × 2（開始〜終了） | `gte(start)` + `lte(end)` に展開 |
| `this_week` | is this week | 入力なし（日付範囲をヒント表示） | `gte(月曜)` + `lte(日曜)` に展開 |
| `this_month` | is this month | 入力なし（日付範囲をヒント表示） | `gte(月初)` + `lte(月末)` に展開 |
| `last_month` | is last month | 入力なし（日付範囲をヒント表示） | `gte(前月初)` + `lte(前月末)` に展開 |
| `next_month` | is next month | 入力なし（日付範囲をヒント表示） | `gte(翌月初)` + `lte(翌月末)` に展開 |
| `is_empty` | is empty | 入力なし | そのまま |
| `is_not_empty` | is not empty | 入力なし | そのまま |

- 特殊オペレータ（`between`, `this_week`, `this_month`, `last_month`, `next_month`）はフロントエンドのみの概念
- API送信前に `expandDateFilters()` で標準オペレータ（`gte` + `lte`）に展開される
- 相対指定時は計算後の日付範囲をグレーテキストでヒント表示（例: "2026-03-01 〜 2026-03-31"）

## ソート

- 列ヘッダークリックで昇順 → 降順 → 解除のサイクル
- Toolbar の Sort ボタンで複数カラムソートを設定可能
- 内部的には `listRecords` の `sort` パラメータに変換

## 検索

- Toolbar の検索ボックスはリアルタイムフィルター（クライアントサイド）
- 3文字以上の入力で FTS5 全文検索（サーバーサイド）にフォールバック可能

## フィルター永続化

- フィルター条件は `localStorage` にテーブル別に保存される
- キー: `kura:filters:${tableName}`
- テーブル切り替え時に自動復元、フィルタクリア時に `removeItem`

## テーブル設定モーダル

⚙ ボタンから開くモーダルで以下を編集:
- **テーブル別名（alias）**: テーブル名の代わりに表示する名前
- **AI コンテキスト**: テーブルの意味やルールを AI エージェント向けに記述

## CSV ダウンロード

Topbar の CSV ボタンをクリックすると、現在のテーブルデータを CSV ファイルとしてダウンロードする。
- `GET /api/tables/:name/export` でブラウザのネイティブダウンロードをトリガー
- RFC 4180 準拠のエスケープ処理

## API 設計（Hono）

| Method | Path | Core 関数 | 説明 |
|--------|------|-----------|------|
| GET | `/api/tables` | `listTables` | テーブル一覧（alias 含む） |
| GET | `/api/tables/:name` | `describeTable` | テーブルスキーマ（alias 含む） |
| PUT | `/api/tables/:name/alias` | `setAlias` | テーブル別名設定 |
| PUT | `/api/tables/:name/columns/:col/alias` | `setAlias` | カラム別名設定 |
| PUT | `/api/tables/:name/columns/:col/rename` | `renameColumn` | カラムリネーム |
| GET | `/api/tables/:name/ai-context` | `getAiContext` | AI コンテキスト取得 |
| PUT | `/api/tables/:name/ai-context` | `setAiContext` | AI コンテキスト設定 |
| DELETE | `/api/tables/:name/ai-context` | `clearAiContext` | AI コンテキスト削除 |
| GET | `/api/tables/:name/export` | — | CSV エクスポート |
| GET | `/api/tables/:name/records` | `listRecords` | レコード一覧（filter/sort/limit対応） |
| GET | `/api/tables/:name/records/:id` | `getRecord` | レコード詳細 |
| POST | `/api/tables/:name/records` | `addRecord` | レコード追加 |
| PATCH | `/api/tables/:name/records/:id` | `updateRecord` | レコード更新 |
| DELETE | `/api/tables/:name/records/:id` | `deleteRecord` | レコード削除 |
| GET | `/api/search` | `search` | 全文検索 |

## デザインシステム

### カラー

```
--bg:             #ffffff     メイン背景
--bg-secondary:   #f7f7f5     サイドバー、ヘッダー背景
--bg-hover:       #efefef     ホバー
--bg-active:      #e8e8e5     アクティブ
--text:           #37352f     メインテキスト
--text-secondary: #787774     セカンダリテキスト
--text-tertiary:  #b4b4b0     プレースホルダー、補足
--border:         #e9e9e7     ボーダー
--accent:         #2eaadc     アクセント（リンク、フォーカス）
--accent-bg:      #e8f4f8     アクセント背景
```

### タグカラー

```
blue:   bg #d3e5ef, text #183b56
green:  bg #dbeddb, text #1e4620
orange: bg #fadec9, text #5a3a1a
red:    bg #ffe2dd, text #6e2b20
purple: bg #e8deee, text #412d56
yellow: bg #fdecc8, text #5a4a1a
gray:   bg #e3e2e0, text #4a4a46
```

### タイポグラフィ

- UI フォント: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif`
- Mono フォント: `"SF Mono", "Fira Code", "Fira Mono", monospace`
- テーブルセル: 13px
- ヘッダーラベル: 12px, weight 500
- モーダルタイトル: 24px, weight 700

### スペーシング

- Sidebar 幅: 240px
- Topbar 高さ: 44px
- セルパディング: 6px 10px
- 角丸: 6px（通常）、10px（モーダル）
- シャドウ（通常）: `0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)`
- シャドウ（モーダル）: `0 4px 16px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.12)`

## プロトタイプ

`docs/ui-prototype.html` にスタンドアロンの HTML プロトタイプがある。サンプルデータ入りで、テーブル切り替え・リレーション遷移・モーダル・検索の動作を確認できる。
