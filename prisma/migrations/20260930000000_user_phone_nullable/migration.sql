-- AUTH-19: регистрация по email без телефона — поле phone становится необязательным
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
