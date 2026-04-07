#!/bin/bash

echo "=== Testing Table API ==="
echo

echo "1. Creating a table..."
TABLE_RESPONSE=$(curl -s -X POST http://localhost:3000/tables \
  -H "Content-Type: application/json" \
  -d '{"name":"customers","columns":[{"name":"name","type":"string"},{"name":"age","type":"number"}]}')
TABLE_ID=$(echo "$TABLE_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Response: $TABLE_RESPONSE"
echo "Table ID: $TABLE_ID"
echo

echo "2. Inserting a valid row..."
curl -s -w "\nStatus: %{http_code}\n" -X POST "http://localhost:3000/tables/$TABLE_ID/rows" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","age":30}'
echo

echo "3. Inserting another valid row..."
curl -s -w "\nStatus: %{http_code}\n" -X POST "http://localhost:3000/tables/$TABLE_ID/rows" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","age":25}'
echo

echo "4. Getting all rows..."
curl -s "http://localhost:3000/tables/$TABLE_ID/rows"
echo
echo

echo "5. Inserting with invalid type (age as string) — should return 400..."
curl -s -w "\nStatus: %{http_code}\n" -X POST "http://localhost:3000/tables/$TABLE_ID/rows" \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","age":"thirty"}'
echo

echo "6. Querying non-existent table — should return 404..."
curl -s -w "\nStatus: %{http_code}\n" "http://localhost:3000/tables/invalid-id/rows"
echo
