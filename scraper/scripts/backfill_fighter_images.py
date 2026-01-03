#!/usr/bin/env python3
"""
Backfill Fighter Images

This script fetches images for fighters in the database who don't have images yet.
It uses the same image sources as the scraper (ESPN, Wikipedia).

Usage:
    # Set DATABASE_URL environment variable
    export DATABASE_URL="postgresql://..."

    # Run the backfill (default: 50 fighters at a time)
    python scripts/backfill_fighter_images.py

    # Limit to specific number of fighters
    python scripts/backfill_fighter_images.py --limit 100

    # Dry run (don't update database)
    python scripts/backfill_fighter_images.py --dry-run

    # Force update existing images
    python scripts/backfill_fighter_images.py --force

Requirements:
    pip install psycopg2-binary requests
"""

import os
import sys
import argparse
import logging
from typing import Optional, List, Tuple

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor

from ufc_scraper.image_scraper import get_fighter_image

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_database_url() -> str:
    """Get database URL from environment."""
    url = os.environ.get('DATABASE_URL')
    if not url:
        raise ValueError(
            "DATABASE_URL environment variable not set. "
            "Example: postgresql://user:pass@host:port/dbname"
        )
    return url


def get_fighters_without_images(
    conn,
    limit: int = 50,
    force: bool = False
) -> List[Tuple[str, str]]:
    """
    Get fighters who need images.

    Returns:
        List of (id, name) tuples
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if force:
            # Get all fighters
            query = """
                SELECT id, name
                FROM fighters
                ORDER BY name
                LIMIT %s
            """
        else:
            # Get fighters without images
            query = """
                SELECT id, name
                FROM fighters
                WHERE "imageUrl" IS NULL
                ORDER BY name
                LIMIT %s
            """

        cur.execute(query, (limit,))
        rows = cur.fetchall()
        return [(row['id'], row['name']) for row in rows]


def update_fighter_image(conn, fighter_id: str, image_url: str) -> bool:
    """
    Update a fighter's image URL in the database.

    Returns:
        True if successful
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE fighters SET "imageUrl" = %s WHERE id = %s',
                (image_url, fighter_id)
            )
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Failed to update fighter {fighter_id}: {e}")
        conn.rollback()
        return False


def count_fighters_without_images(conn) -> Tuple[int, int]:
    """
    Count fighters with and without images.

    Returns:
        Tuple of (without_images, total)
    """
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM fighters WHERE "imageUrl" IS NULL')
        without_images = cur.fetchone()[0]

        cur.execute('SELECT COUNT(*) FROM fighters')
        total = cur.fetchone()[0]

        return without_images, total


def main():
    parser = argparse.ArgumentParser(
        description='Backfill fighter images from ESPN and Wikipedia'
    )
    parser.add_argument(
        '--limit', '-l',
        type=int,
        default=50,
        help='Maximum number of fighters to process (default: 50)'
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Show what would be done without making changes'
    )
    parser.add_argument(
        '--force', '-f',
        action='store_true',
        help='Re-fetch images even for fighters who already have them'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Connect to database
    try:
        database_url = get_database_url()
        conn = psycopg2.connect(database_url)
        logger.info("Connected to database")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        sys.exit(1)

    try:
        # Show current stats
        without_images, total = count_fighters_without_images(conn)
        logger.info(f"Fighters without images: {without_images} / {total}")

        if without_images == 0 and not args.force:
            logger.info("All fighters have images. Use --force to re-fetch.")
            return

        # Get fighters to process
        fighters = get_fighters_without_images(conn, args.limit, args.force)
        logger.info(f"Processing {len(fighters)} fighters...")

        if args.dry_run:
            logger.info("DRY RUN - no changes will be made")

        # Process each fighter
        success_count = 0
        fail_count = 0
        skip_count = 0

        for i, (fighter_id, fighter_name) in enumerate(fighters, 1):
            logger.info(f"[{i}/{len(fighters)}] Looking up image for: {fighter_name}")

            try:
                image_url = get_fighter_image(fighter_name)

                if image_url:
                    if args.dry_run:
                        logger.info(f"  Would update: {image_url}")
                        success_count += 1
                    else:
                        if update_fighter_image(conn, fighter_id, image_url):
                            logger.info(f"  Updated: {image_url}")
                            success_count += 1
                        else:
                            logger.warning(f"  Failed to update database")
                            fail_count += 1
                else:
                    logger.debug(f"  No image found")
                    skip_count += 1

            except Exception as e:
                logger.error(f"  Error: {e}")
                fail_count += 1

        # Summary
        logger.info("")
        logger.info("=" * 50)
        logger.info("Backfill Complete")
        logger.info(f"  Success: {success_count}")
        logger.info(f"  No image found: {skip_count}")
        logger.info(f"  Failed: {fail_count}")

        if not args.dry_run:
            without_images_after, _ = count_fighters_without_images(conn)
            logger.info(f"  Remaining without images: {without_images_after}")

    finally:
        conn.close()


if __name__ == '__main__':
    main()
