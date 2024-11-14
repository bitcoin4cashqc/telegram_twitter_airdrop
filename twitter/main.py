import asyncio
from flask import Flask, request, jsonify
from twscrape import API, gather
from redis import Redis
from functools import wraps
import time

app = Flask(__name__)
api = API("accounts.db")  # Default database for account storage
cache = Redis(host='localhost', port=6379, decode_responses=True)  # Redis for caching

# Helper function to run async functions in sync
def async_to_sync(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))
    return wrapper

# Endpoint to check if a user has retweeted and commented on a tweet
@app.route("/verify_task", methods=["GET"])
@async_to_sync
async def verify_task():
    user_login = request.args.get("user_login")
    tweet_id = request.args.get("tweet_id")
    
    # Validate inputs
    if not user_login or not tweet_id:
        return jsonify({"error": "Missing required parameters: user_login, tweet_id"}), 400
    
    # Check cache first
    cache_key = f"{user_login}:{tweet_id}:task_verification"
    cached_result = cache.get(cache_key)
    if cached_result:
        return jsonify({"result": cached_result, "cached": True}), 200

    # Retrieve the user object and tweet engagement status
    try:
        user = await api.user_by_login(user_login)
        user_id = user.id
        
        # Check retweet and comment status
        retweets = await gather(api.retweeters(tweet_id, limit=3000))  # limit for large numbers of users
        comments = await gather(api.tweet_replies(tweet_id, limit=3000))
        
        # Verify user action
        retweeted = any(retweeter.id == user_id for retweeter in retweets)
        commented = any(comment.user.id == user_id for comment in comments)

        result = {
            "retweeted": retweeted,
            "commented": commented
        }

        # Store in cache (expire after 5 minutes to keep cache fresh)
        cache.setex(cache_key, 300, str(result))
        
        return jsonify({"result": result, "cached": False}), 200
    
    except Exception as e:
        print(f"Error verifying user action: {e}")
        return jsonify({"error": "Error verifying user action"}), 500


# CLI Instructions for Account Addition in ReadMe
@app.route("/add_account_instructions", methods=["GET"])
def add_account_instructions():
    instructions = """
    To add an account for task verification, use the following CLI commands:

    # Adding an account with username, password, email, and email password
    python -m twscrape.pool add <username> <password> <email> <email_password>

    # Add account with cookies
    python -m twscrape.pool add <username> <password> <email> <email_password> --cookies "<cookie_string>"

    Replace <username>, <password>, <email>, and <email_password> with the relevant values.
    """
    return jsonify({"instructions": instructions})


if __name__ == "__main__":
    # Initialize API and login accounts if needed
    asyncio.run(api.pool.login_all())
    app.run(host="0.0.0.0", port=5000)
