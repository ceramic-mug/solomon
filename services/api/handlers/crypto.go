package handlers

import "golang.org/x/crypto/bcrypt"

func comparePassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
