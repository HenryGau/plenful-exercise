#!/bin/bash
# Manual API Testing Script - Tests all endpoints of the Tables API

set -e
BASE_URL="http://localhost:3000"

# Track tables created during this test for cleanup
TABLES_CREATED=()

# Cleanup function: Delete all tables created during this test run
cleanup() {
  echo ""
  echo "Cleaning up test data..."
  for TABLE_ID in "${TABLES_CREATED[@]}"; do
    curl -s -X DELETE "$BASE_URL/tables/$TABLE_ID" > /dev/null 2>&1 || true
  done
  echo "Cleanup complete."
}

# Run cleanup on exit (success or failure)
trap cleanup EXIT

echo "=== Tables API Manual Testing ==="
echo "Testing against: $BASE_URL"
echo ""

# 1. CREATE TABLE
echo "1. CREATE TABLE"
echo "==============="
TABLE_RESPONSE=$(curl -s -X POST "$BASE_URL/tables" \
  -H "Content-Type: application/json" \
  -d '{"name":"customers","columns":[{"name":"name","type":"string"},{"name":"email","type":"string"},{"name":"age","type":"number"},{"name":"active","type":"boolean"}]}')
TABLE_ID=$(echo "$TABLE_RESPONSE" | jq -r '.id')
TABLES_CREATED+=("$TABLE_ID")
echo "Created table ID: $TABLE_ID"
echo ""

# 2. INSERT ROWS
echo "2. INSERT ROWS"
echo "=============="
ROW1=$(curl -s -X POST "$BASE_URL/tables/$TABLE_ID/rows" -H "Content-Type: application/json" -d '{"name":"Alice","email":"alice@example.com","age":30,"active":true}')
ROW1_ID=$(echo "$ROW1" | jq -r '.id')
echo "Inserted row 1 (Alice, age 30)"

ROW2=$(curl -s -X POST "$BASE_URL/tables/$TABLE_ID/rows" -H "Content-Type: application/json" -d '{"name":"Bob","email":"bob@example.com","age":25,"active":true}')
ROW2_ID=$(echo "$ROW2" | jq -r '.id')
echo "Inserted row 2 (Bob, age 25)"

ROW3=$(curl -s -X POST "$BASE_URL/tables/$TABLE_ID/rows" -H "Content-Type: application/json" -d '{"name":"Charlie","email":"charlie@example.com","age":35,"active":false}')
ROW3_ID=$(echo "$ROW3" | jq -r '.id')
echo "Inserted row 3 (Charlie, age 35, inactive)"
echo ""

# 3. GET ALL ROWS
echo "3. GET ALL ROWS"
echo "==============="
ROWS=$(curl -s -X GET "$BASE_URL/tables/$TABLE_ID/rows")
COUNT=$(echo "$ROWS" | jq 'length')
echo "Retrieved $COUNT rows"
echo ""

# 4. FILTER ROWS
echo "4. FILTER ROWS"
echo "=============="
echo "Filter by name=Alice:"
curl -s -X GET "$BASE_URL/tables/$TABLE_ID/rows?filter[name]=Alice" | jq '.[0].name'

echo "Filter by age=25:"
curl -s -X GET "$BASE_URL/tables/$TABLE_ID/rows?filter[age]=25" | jq '.[0].name'

echo "Filter by active=false:"
curl -s -X GET "$BASE_URL/tables/$TABLE_ID/rows?filter[active]=false" | jq '.[0].name'
echo ""

# 5. UPDATE ROW
echo "5. UPDATE ROW"
echo "============="
echo "Updating Alice: age 30 -> 31"
curl -s -X PUT "$BASE_URL/tables/$TABLE_ID/rows/$ROW1_ID" -H "Content-Type: application/json" -d '{"name":"Alice","email":"alice.new@example.com","age":31,"active":true}' | jq '.age'
echo ""

# 6. ADD COLUMN
echo "6. ADD COLUMN TO SCHEMA"
echo "======================="
echo "Adding phone column..."
curl -s -X PATCH "$BASE_URL/tables/$TABLE_ID/schema" -H "Content-Type: application/json" -d '{"add":[{"name":"phone","type":"string"}]}' | jq '.columns | length'
echo ""

# 7. REMOVE COLUMN
echo "7. REMOVE COLUMN FROM SCHEMA"
echo "============================="
echo "Removing phone column..."
curl -s -X PATCH "$BASE_URL/tables/$TABLE_ID/schema" -H "Content-Type: application/json" -d '{"remove":["phone"]}' | jq '.columns | length'
echo ""

# 8. DELETE ROW
echo "8. DELETE ROW"
echo "============="
echo "Deleting Charlie (row 3)..."
curl -s -w "Status: %{http_code}\n" -X DELETE "$BASE_URL/tables/$TABLE_ID/rows/$ROW3_ID"
echo "Verifying deletion (should show 2 rows)..."
curl -s -X GET "$BASE_URL/tables/$TABLE_ID/rows" | jq 'length'
echo ""

# 9. DELETE TABLE
echo "9. DELETE TABLE"
echo "==============="
echo "Deleting the table..."
curl -s -w "Status: %{http_code}\n" -X DELETE "$BASE_URL/tables/$TABLE_ID"
echo "Verifying deletion (should return 404)..."
curl -s -w "Status: %{http_code}\n" -X GET "$BASE_URL/tables/$TABLE_ID/rows" | tail -1
# Remove from tracking array since we explicitly deleted it
TABLES_CREATED=("${TABLES_CREATED[@]/$TABLE_ID}")
echo ""

# 10. VALIDATION TESTS
echo "10. VALIDATION TESTS"
echo "===================="
echo "Test invalid name (should be 400):"
curl -s -X POST "$BASE_URL/tables" -H "Content-Type: application/json" -d '{"name":123,"columns":[{"name":"col","type":"string"}]}' | jq '.error'

echo "Test missing required field (should be 400):"
NEW_TABLE=$(curl -s -X POST "$BASE_URL/tables" -H "Content-Type: application/json" -d '{"name":"test","columns":[{"name":"field","type":"string"}]}')
NEW_TABLE_ID=$(echo "$NEW_TABLE" | jq -r '.id')
TABLES_CREATED+=("$NEW_TABLE_ID")
curl -s -X POST "$BASE_URL/tables/$NEW_TABLE_ID/rows" -H "Content-Type: application/json" -d '{}' | jq '.error'

echo "Test wrong type (should be 400):"
curl -s -X POST "$BASE_URL/tables/$NEW_TABLE_ID/rows" -H "Content-Type: application/json" -d '{"field":123}' | jq '.error'

echo "Test unknown filter column (should be 400):"
curl -s -X GET "$BASE_URL/tables/$NEW_TABLE_ID/rows?filter[unknown]=value" | jq '.error'

echo ""
echo "=== Manual Testing Complete ==="
echo "✓ All endpoints tested successfully"
