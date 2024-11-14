import os
import random
import json
from flask import Flask, request, jsonify
from twitter.scraper import Scraper
import redis

app = Flask(__name__)
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
CACHE_TIME = 60  # Cache duration in seconds

# Utility to parse cookies
def parse_cookie_string(cookie_string):
    cookie_dict = {}
    cookies = cookie_string.split('; ')
    for cookie in cookies:
        if '=' in cookie:
            key, value = cookie.split('=', 1)
            cookie_dict[key] = value
    return cookie_dict

# Load cookies from cookies.txt
def load_cookies():
    with open("cookies.txt", "r") as file:
        return [parse_cookie_string(line.strip()) for line in file if line.strip()]

# Select a random cookie
def get_random_cookie():
    cookies = load_cookies()
    return random.choice(cookies)

# Cache tweet details in Redis
def cache_tweet_details(scraper, tweet_id):
    cache_key = f"tweet:{tweet_id}:details"
    cached_data = redis_client.get(cache_key)
    if cached_data:
        return json.loads(cached_data), True
    tweet_details = scraper.tweets_details([tweet_id])
    redis_client.setex(cache_key, CACHE_TIME, json.dumps(tweet_details))
    return tweet_details, False

# Cache retweeters data in Redis
def cache_retweeters_data(scraper, tweet_id):
    cache_key = f"tweet:{tweet_id}:retweeters"
    cached_data = redis_client.get(cache_key)
    if cached_data:
        return json.loads(cached_data), True
    retweeters_data = scraper.retweeters([tweet_id])
    redis_client.setex(cache_key, CACHE_TIME, json.dumps(retweeters_data))
    return retweeters_data, False

# Check if a user has commented
def check_user_comment(cached_tweet_details, screen_name_to_check, tweet_id):
    try:
        for instruction in cached_tweet_details[0]['data']['threaded_conversation_with_injections_v2']['instructions']:
            if instruction['type'] == 'TimelineAddEntries':
                for entry in instruction['entries']:
                    if 'TimelineTimelineModule' in entry.get('content', {}).get('__typename', ''):
                        for item in entry['content'].get('items', []):
                            tweet_results = item.get('item', {}).get('itemContent', {}).get('tweet_results', {}).get('result', {})
                            user_data = tweet_results.get('core', {}).get('user_results', {}).get('result', {})
                            tweet_legacy = tweet_results.get('legacy', {})
                            screen_name = user_data.get('legacy', {}).get('screen_name')
                            in_reply_to_status_id = tweet_legacy.get('in_reply_to_status_id_str')
                            if screen_name == screen_name_to_check and in_reply_to_status_id == tweet_id:
                                return {"commented": True}
        return {"commented": False}
    except Exception as e:
        print(f"Error verifying user comment: {e}")
        return {"error": "Failed to verify"}

# Check if a user has retweeted
def check_user_retweet(cached_retweeters_data, screen_name_to_check):
    try:
        for instruction in cached_retweeters_data[0]['data']['retweeters_timeline']['timeline']['instructions']:
            if instruction['type'] == 'TimelineAddEntries':
                for entry in instruction['entries']:
                    if entry.get('entryId', '').startswith('user-'):
                        user_result = entry['content']['itemContent']['user_results']['result']
                        screen_name = user_result['legacy']['screen_name']
                        if screen_name == screen_name_to_check:
                            return {"retweeted": True}
        return {"retweeted": False}
    except Exception as e:
        print(f"Error verifying user retweet: {e}")
        return {"error": "Failed to verify"}

@app.route('/verify_task', methods=['GET'])
def verify_task():
    tweet_id = request.args.get("tweet_id")
    screen_name = request.args.get("screen_name")

    # Initialize scraper with a random cookie
    scraper = Scraper(cookies=get_random_cookie())

    # Cache the tweet details and retweeters data
    cached_tweet_details, tweet_details_cached = cache_tweet_details(scraper, tweet_id)
    cached_retweeters_data, retweeters_cached = cache_retweeters_data(scraper, tweet_id)

    # Check if the user has commented and retweeted
    comment_result = check_user_comment(cached_tweet_details, screen_name, tweet_id)
    retweet_result = check_user_retweet(cached_retweeters_data, screen_name)

    return jsonify({
        "comment_result": comment_result,
        "retweet_result": retweet_result,
        "tweet_details_cached": tweet_details_cached,
        "retweeters_cached": retweeters_cached
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
