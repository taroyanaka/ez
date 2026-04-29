#!/bin/bash

# ========================================
# テスト対象のリソース名とベースURL
# ========================================
HOST="http://localhost:3000"

# jqが使えるかチェック
JQ_CMD="cat"
if command -v jq &> /dev/null; then
    JQ_CMD="jq ."
fi

# 各サービスのテスト用関数
test_service() {
  local RESOURCE=$1
  local POST_DATA=$2
  local PUT_DATA=$3
  local BASE_URL="${HOST}/${RESOURCE}"

  echo "========================================"
  echo "API 動作確認: ${RESOURCE}"
  echo "========================================"

  echo "1. GET: 全データを取得します"
  curl -s -X GET "$BASE_URL" | eval $JQ_CMD
  echo ""

  echo "----------------------------------------"
  echo "2. POST: 新しいデータを作成(追加)します"
  curl -s -X POST -H "Content-Type: application/json" -d "$POST_DATA" "$BASE_URL" | eval $JQ_CMD
  echo ""

  echo "----------------------------------------"
  echo "3. GET: 追加確認 (全データ取得)"
  curl -s -X GET "$BASE_URL" | eval $JQ_CMD
  echo ""

  echo "----------------------------------------"
  echo "4. PUT: 0番目のデータを更新します"
  curl -s -X PUT -H "Content-Type: application/json" -d "$PUT_DATA" "$BASE_URL/0" | eval $JQ_CMD
  echo ""

  echo "----------------------------------------"
  echo "5. DELETE: 0番目のデータを削除します"
  curl -s -X DELETE "$BASE_URL/0" | eval $JQ_CMD
  echo ""

  echo "----------------------------------------"
  echo "6. GET: 削除確認 (全データ取得)"
  curl -s -X GET "$BASE_URL" | eval $JQ_CMD
  echo ""
  echo "========================================"
  echo ""
}

# 各サービスごとの動作確認を実行

# ① flashcards
test_service "flashcards" \
  '{"question": "Orange", "answer": "みかん"}' \
  '{"question": "Apple (Updated)", "answer": "りんご(更新)"}'

# ② problems_export
test_service "problems_export" \
  '{"id": "test-post", "question": "テストの質問です", "answer": "テスト\n質問"}' \
  '{"id": "test-put", "question": "更新された質問です", "answer": "更新\n質問"}'

# ③ reading_quizzes
test_service "reading_quizzes" \
  '{"id": "test-123", "title": "テストクイズ", "passage": "これはテスト用の文章です。", "questions": [{"id":"test-q1", "questionText": "これは何ですか？", "choices": ["テスト","本番"], "correctIndex": 0}]}' \
  '{"id": "test-123", "title": "更新されたタイトル", "passage": "更新された文章です。", "questions": [{"id":"test-q1", "questionText": "更新されましたか？", "choices": ["はい","いいえ"], "correctIndex": 0}]}'

echo "全ての動作確認が完了しました！"
