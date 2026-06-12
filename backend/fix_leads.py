import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/homesqre")
    client = AsyncIOMotorClient(mongo_uri)
    db = client.get_default_database()
    
    leads = await db.leads.find({"phone": {"$in": ["", None]}}).to_list(None)
    fixed = 0
    
    for lead in leads:
        email = lead.get("email")
        if email:
            user = await db.users.find_one({"email": email})
            if user and user.get("mobile"):
                await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"phone": user["mobile"]}})
                print(f"Fixed lead {lead['lead_id']} ({email}) with phone {user['mobile']}")
                fixed += 1
                
    print(f"Done. Fixed {fixed} leads.")

if __name__ == "__main__":
    asyncio.run(main())
