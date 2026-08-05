"""
UrbanShield Logger
"""

import sys
from loguru import logger

logger.remove()

logger.add(
    sys.stdout,
    level="INFO",
    colorize=True,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
           "<level>{level}</level> | "
           "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
           "<level>{message}</level>"
)

logger.add(
    "outputs/urbanshield.log",
    rotation="10 MB",
    retention="10 days",
    level="DEBUG"
)

__all__ = ["logger"]
