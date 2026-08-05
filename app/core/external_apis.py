import httpx

async def get_weather_context(lat: float, lon: float) -> dict:
    """
    Fetches real-time weather & precipitation for the exact hazard location.
    """
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,rain,weather_code"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=4.0)
            if response.status_code == 200:
                data = response.json().get("current", {})
                return {
                    "rain_mm": data.get("rain", 0.0),
                    "temp_c": data.get("temperature_2m", 28.0),
                    "is_raining": data.get("rain", 0.0) > 0.1
                }
    except Exception as e:
        print(f"Weather API fallback triggered: {e}")
    
    return {"rain_mm": 0.0, "temp_c": 28.0, "is_raining": False}