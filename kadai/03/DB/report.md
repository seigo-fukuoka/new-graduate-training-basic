
## 課題1

### 1. 問題点の指摘

user_nameとuser_id、recipe_titleとrecipe_idが重複して保存される点で冗長性に問題がある。これはデータ更新時に、一貫性の問題が生じる危険性を孕んでいる。例えば、user_name「田中圭」を変更したい場合、favorite_idが「１」と「３」の複数の行を更新する必要があり、もし片方の更新が漏れると一貫性が失われてしまう。

### 2. テーブルの正規化

**【ユーザー】テーブル**
| **user_id** | user_name |
| :--- | :--- |
| U001 | 田中圭 |
| U002 | 鈴木恵 |
| U003 | 佐藤 翼 |

**【レシピ】テーブル**
| **recipe_id** | recipe_title |
| :--- | :--- |
| R01 | 絶品カルボナーラ |
| R05 | 本格エビチリ |

**【ユーザーお気に入り】テーブル**
| **favorite_id** | user_id | recipe_id | registration_date |
| :--- | :--- | :--- | :--- |
| 1 | U001 | R01 | 2025-10-01 |
| 2 | U002 | R05 | 2025-10-01 |
| 3 | U001 | R05 | 2025-10-02 |
| 4 | U003 | R01 | 2025-10-03 |

### 3. SQLクエリの作成

SELECT DISTINCT
  T3.recipe_title
FROM
  Users AS T1
JOIN
  UserFavorites AS f ON T1.user_id = T2.user_id
JOIN
  Recipes AS r ON T2.recipe_id = T3.recipe_id
WHERE
  T1.user_name = '田中圭';

## 課題2
### 1. パフォーマンスが遅い原因の推測
数億件ある access_logs テーブルにインデックスが一切設定されていないため 。


WHERE 句の recipe_id = 'R0123' と access_timestamp BETWEEN ...  の条件で絞り込む際、インデックスが使えないため、数億件のデータすべてをスキャンしてしまっている。 さらに、ORDER BY access_timestamp DESC  での並び替え処理も、ソートのために追加の負荷がかかっている。


### 2. インデックスの設計
作成すべきインデックス: recipe_id と access_timestamp の2つカラムを使った複合インデックスを作成する。

理由: クエリの WHERE 句で使われる絞り込み条件（recipe_id と access_timestamp） と ORDER BY 句の並び替え条件（access_timestamp）  の両方を、このインデックスでカバーできるため。 これにより、フルテーブルスキャンと追加のソート処理を回避でき、検索速度が大幅に改善される