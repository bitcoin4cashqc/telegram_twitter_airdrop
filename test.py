from twitter.scraper import Scraper

# Sample cookie string from the browser
cookie_string = 'guest_id=173100276255991615; night_mode=2; guest_id_marketing=v1%3A173100276255991615; guest_id_ads=v1%3A173100276255991615; kdt=LfQ9eZDwpX7wPN4HJIyfNdSqhjkAbQEspvCkkd2q; auth_token=b90f6da6734807f18ac48cb081b2a44f0ff69872; ct0=e34c82367cd76bb1deec554573517550710c505718c62d7d9de209684bf3ba1b97a9ca005e3cb6d60bd7d6f7f43bf62708ec93f6fe17d3ca03e2c70bffb71583015bd2f375ed48045d2e802a295eb837; des_opt_in=Y; _ga=GA1.2.466314167.1731002838; twid=u%3D794225006871973889; external_referer=padhuUp37zi7hqV4EQRUSdeHq9rnxN6g|0|8e8t2xd8A2w%3D; lang=fr; _gid=GA1.2.1573387252.1731509149; personalization_id="v1_bFKknOKbkeY1a7MG01qn2w=="; _twitter_sess=BAh7CSIKZmxhc2hJQzonQWN0aW9uQ29udHJvbGxlcjo6Rmxhc2g6OkZsYXNo%250ASGFzaHsABjoKQHVzZWR7ADoPY3JlYXRlZF9hdGwrCHRoFCaTAToMY3NyZl9p%250AZCIlYmVhMzRhZmI5NGE2ODEyNTc3NDkyMTU5ZjFhOTY1MWY6B2lkIiUzZGM2%250AZmU2NWE4OWY5OTQxOTUyYTllNWE5NDIyYTAwZA%253D%253D--fb97f017460e11f548a99d7a5d94db48c705e335'


def parse_cookie_string(cookie_string):
    """
    Convert a cookie string into a dictionary format.
    
    Parameters:
    - cookie_string: str - Cookie string from the browser (e.g., 'key1=value1; key2=value2')
    
    Returns:
    - dict - Dictionary of cookies for authentication
    """
    cookie_dict = {}
    cookies = cookie_string.split('; ')
    
    for cookie in cookies:
        if '=' in cookie:
            key, value = cookie.split('=', 1)
            cookie_dict[key] = value
    
    return cookie_dict



# Initialize the scraper
scraper = Scraper(cookies=parse_cookie_string(cookie_string))




def get_tweets(tweet_id):
    
    try:
        # Fetch the list of users who liked the tweet
        tweets = scraper.retweeters([tweet_id])
       
        return tweets
    
    except Exception as e:
        print(f"Error checking tweet like: {e}")
        return False

tweets = get_tweets("1856722908967583890")
print(tweets)

