FROM node
WORKDIR /src

# Separate copy to cache node modules
COPY package*.json ./
RUN npm i

# Copy everything else over
COPY . .

# Run!
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]