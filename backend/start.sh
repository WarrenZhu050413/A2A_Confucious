#!/bin/bash

echo "🚀 Starting Nabokov Backend Server..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies first..."
  npm install
  echo ""
fi

# Start the server
node server.mjs
