Twitter Engagement Verification API

This API allows querying if a specific user has retweeted and commented on a given tweet using twscrape. The setup includes a Redis cache to handle high-volume requests efficiently.

1. Requirements

    Python 3.7 or higher
    Redis for caching
    twscrape for Twitter scraping


2. Install Python and Redis
Installing Python

If Python is not installed, you can download it from Python's official website. Ensure you add Python to your PATH during installation.

Verify installation:

python --version

Installing Redis

To install Redis on your system:

Ubuntu:

sudo apt update
sudo apt install redis-server

macOS (using Homebrew):

brew install redis

Windows:

    Download the Redis package from here and follow the setup instructions.

Start Redis:

redis-server

3. Install Project Dependencies

Use pip to install the required Python packages:

pip install -r requirements.txt

If requirements.txt is not available, you can install dependencies manually:

pip install twscrape flask redis

4. Set Up the twscrape Accounts Database

Twscrape requires an accounts database (accounts.db) to store Twitter accounts used for data scraping.

To add accounts to the database, use twscrape's CLI:

    Add an account with username, password, email, and email password:

python -m twscrape.pool add <username> <password> <email> <email_password>

Add an account with cookies:

    python -m twscrape.pool add <username> <password> <email> <email_password> --cookies "<cookie_string>"

Replace <username>, <password>, <email>, and <email_password> with the relevant values.
5. Running the Flask API

Start the Flask API:

python app.py

The API will run by default on http://localhost:5000.
Usage Instructions
Endpoint: /verify_task

This endpoint checks if a user has retweeted and commented on a specific tweet.

Method: GET

Parameters:

    user_login: The Twitter handle of the user to check.
    tweet_id: The ID of the tweet to verify.

Example:

curl "http://localhost:5000/verify_task?user_login=elonmusk&tweet_id=12345"

The response will indicate whether the user has retweeted and commented on the tweet, with cache status information.

Notes

    Ensure Redis is running to enable caching.
    The API caches verification results for 5 minutes to handle large request volumes efficiently.
    Adjust caching duration in app.py as necessary.
