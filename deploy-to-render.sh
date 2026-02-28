#!/bin/bash

echo "========================================="
echo "  Stripe Bypass API - Render Deployment"
echo "========================================="
echo ""

# Check if in correct directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: Run this script from the railway-bypass-api directory"
    exit 1
fi

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit - Stripe bypass API for Render deployment"
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already initialized"
fi

echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Create a GitHub repository:"
echo "   - Go to https://github.com/new"
echo "   - Name: stripe-bypass-api"
echo "   - Make it private (recommended)"
echo ""
echo "2. Push your code:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/stripe-bypass-api.git"
echo "   git push -u origin main"
echo ""
echo "3. Deploy to Render:"
echo "   - Go to https://dashboard.render.com/"
echo "   - Click 'New +' → 'Blueprint'"
echo "   - Connect your GitHub repo"
echo "   - Click 'Apply'"
echo ""
echo "4. After deployment:"
echo "   - Copy your BEARER_TOKEN from Render Dashboard"
echo "   - Update Chrome extension background.js:"
echo "     var WORKER_BASE_URL = 'https://YOUR_APP.onrender.com';"
echo "     var AUTH_TOKEN = 'YOUR_BEARER_TOKEN';"
echo ""
echo "📖 Full guide: See RENDER_DEPLOYMENT.md"
echo ""
